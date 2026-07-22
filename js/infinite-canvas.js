/* ============================================
   COUNTER- CLT — INFINITE CANVAS
   ============================================
   A seamless, pan-anywhere image space built on Three.js, after Edoardo
   Lunardi's "Infinite Canvas" (github.com/edoardolunardi/infinite-canvas).

   Space is a true 3D grid of chunks (cx, cy, cz). Planes are scattered through
   all three axes — including depth — so scrolling flies the camera *through*
   the images along Z rather than panning a flat wall. Only a small
   neighbourhood of chunks around the camera is alive at once, and each chunk's
   contents are derived from a hash of its coordinates, so a chunk culled on one
   side and rebuilt later returns identical. That determinism is what makes the
   space read as one continuous world.

   Controls:
     - drag           -> pan X / Y
     - wheel / scroll -> zoom through the images along Z
   ============================================ */

import * as THREE from "three";

/* ---------- world tuning ---------- */
const CHUNK_SIZE = 90;
/* Chunk neighbourhood kept alive around the camera, per axis. The camera lives
   INSIDE this cloud, so the lateral axes need enough width to reach past the
   frustum edges at the far visible depth — otherwise the field reads as a
   cluster floating in the middle of the screen instead of surrounding you. */
const RENDER_X = 2;
const RENDER_Y = 2;
const RENDER_Z = 2;
const ITEMS_PER_CHUNK = 5;

/* Planes are placed on a stratified sub-grid inside each chunk rather than at
   fully-random points: the chunk is split into GRID_X*GRID_Y*GRID_Z cells, and
   each item claims a distinct cell and jitters only within it. That guarantees
   a minimum separation between planes, so the field reads as spaced-out layers
   instead of a random pile-up. Cells (18) comfortably exceed ITEMS_PER_CHUNK,
   so there's slack for the shuffle to spread things around. */
const GRID_X = 3;
const GRID_Y = 3;
const GRID_Z = 2;
/* Fraction of a cell an item may wander from its cell centre (0 = dead centre,
   1 = anywhere in the cell). Kept below 1 so items never reach a cell edge and
   collide with a neighbour. */
const CELL_JITTER = 0.55;

/* Plane sizes are kept small relative to the chunk so the field reads as many
   spread-out images (lots of negative space) rather than a few big ones packed
   together — see the reference "Infinite Canvas" demo. */
const PLANE_MIN = 14;
const PLANE_MAX = 25;

/* Resting camera depth — where the fly-through reveal settles. Small enough
   that images sit all around the camera at rest ("dropped into the scene"). */
const INITIAL_CAMERA_Z = 40;
const CAMERA_FOV = 60;

/* Depth fade: planes are solid within START of the camera plane, gone by END.
   A deep END keeps several z-layers alive at once, and it's that stack of
   layers — not any single wall — that fills the frustum edge to edge.
   Squared on apply, so they ease rather than pop as you pass through them. */
const DEPTH_FADE_START = 80;
const DEPTH_FADE_END = 250;

/* Near fade: planes dissolve as they approach the camera, so nothing ever gets
   close enough to fill the screen. This is what keeps the settled scene tidy —
   the biggest solid plane sits at NEAR_FADE_FULL, whose apparent size is well
   under a screen height — and it doubles as the "fly through" dissolve: as you
   scroll forward an image grows, then melts away just before you reach it
   instead of blowing up across the whole viewport.
   NEAR_FADE_CUT (fully gone) < NEAR_FADE_FULL (fully solid) < DEPTH_FADE_START. */
const NEAR_FADE_CUT = 20;
const NEAR_FADE_FULL = 55;

/* Reveal (two beats, driven from main.js): the whole pool preloads behind the
   black loader curtain. When it's in, the curtain collapses and fadeIn() brings
   the images up (REVEAL_FADE) — then zoom() flies the camera forward through
   exactly two chunks (REVEAL_ZOOM) over REVEAL_DURATION, after which the overlay
   flips to its difference blend. */
const REVEAL_FADE = 0.8;
const REVEAL_DURATION = 1.6;
const REVEAL_ZOOM = 2 * CHUNK_SIZE;

/* ---------- motion ---------- */
const DRAG_SPEED = 0.05;
const WHEEL_SPEED = 0.05;
const MAX_VELOCITY = 4.5;
const VELOCITY_LERP = 0.16;
const VELOCITY_DECAY = 0.9;
const SCROLL_DECAY = 0.8;
const INVIS_THRESHOLD = 0.01;

/* Mouse parallax: the pointer nudges the camera off the base position, giving
   depth to the still frame. Only engages after the first move (see armFirstMove). */
const DRIFT_AMOUNT = 9;
const DRIFT_LERP = 0.06;

const MAX_CONCURRENT_LOADS = 6;

/* A plane only queues its (full-res) texture once it's this visible, not the
   instant it crosses INVIS_THRESHOLD. Raising the bar keeps the initial load to
   the planes actually around the viewport — the faint, far, edge-of-frustum
   stack streams in as you move toward it instead of all at once. */
const REQUEST_THRESHOLD = 0.12;

/* ---------- deterministic PRNG ---------- */
function hashCoords(cx, cy, cz) {
    let h = 2166136261 >>> 0;
    h = Math.imul(h ^ ((cx + 0x9e3779b9) >>> 0), 16777619);
    h = Math.imul(h ^ ((cy + 0x85ebca6b) >>> 0), 16777619);
    h = Math.imul(h ^ ((cz + 0xc2b2ae35) >>> 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 16777619);
    h ^= h >>> 15;
    return h >>> 0;
}

/* mulberry32 — cheap, well-distributed, seedable */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createInfiniteCanvas(options) {
    const container = options.container;
    const images = options.images;

    /* ---------- renderer ---------- */
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
    } catch (err) {
        console.warn("Infinite canvas: WebGL unavailable.", err);
        return null;
    }

    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.25 : 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        CAMERA_FOV,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, INITIAL_CAMERA_Z);

    const geometry = new THREE.PlaneGeometry(1, 1);

    /* ---------- texture cache + throttled loading ---------- */
    const loader = new THREE.TextureLoader();
    const textureCache = new Map();
    const loadQueue = [];
    let activeLoads = 0;

    function pumpQueue() {
        while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length) {
            /* Serve the pending job nearest the camera first, so images around
               the viewport resolve before the deep / edge field. Background
               preload jobs (mesh === null) carry no position and sort last, so
               they only fill the pipe once the visible field is served. Stale
               jobs (the plane was recycled) and ones already cached by another
               job are dropped in passing. */
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < loadQueue.length; i++) {
                const j = loadQueue[i];
                if (j.mesh && j.mesh.userData.src !== j.src) {
                    loadQueue.splice(i, 1);
                    i--;
                    continue;
                }
                if (textureCache.has(j.src)) {
                    if (j.mesh) applyTexture(j.mesh, j.src, textureCache.get(j.src));
                    loadQueue.splice(i, 1);
                    i--;
                    continue;
                }
                let d = Infinity;
                if (j.mesh) {
                    const dx = j.mesh.position.x - basePos.x;
                    const dy = j.mesh.position.y - basePos.y;
                    const dz = j.mesh.position.z - basePos.z;
                    d = dx * dx + dy * dy + dz * dz;
                }
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            /* All that's left is background preload (every d === Infinity) —
               take them in order. */
            if (bestIdx === -1) {
                if (!loadQueue.length) break;
                bestIdx = 0;
            }
            const job = loadQueue.splice(bestIdx, 1)[0];

            activeLoads++;
            loader.load(
                job.src,
                function (texture) {
                    activeLoads--;
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    /* Push it to the GPU now, while the loader curtain still hides
                       the scene. Otherwise the upload (+ mipmap gen) happens the
                       first frame a plane using it renders — i.e. mid-zoom, as new
                       chunks scroll in — which is exactly the stutter we saw. */
                    try { renderer.initTexture(texture); } catch (e) {}
                    textureCache.set(job.src, texture);
                    if (job.mesh) applyTexture(job.mesh, job.src, texture);
                    reportProgress();
                    pumpQueue();
                },
                undefined,
                function () {
                    activeLoads--;
                    textureCache.set(job.src, null);
                    reportProgress();
                    pumpQueue();
                }
            );
        }
    }

    function applyTexture(mesh, src, texture) {
        if (!texture || mesh.userData.src !== src) return;
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
        mesh.userData.hasTexture = true;

        /* Keep the image's aspect ratio: the chunk picks a height, width follows */
        const image = texture.image;
        if (image && image.height) {
            mesh.scale.x = mesh.userData.size * (image.width / image.height);
        }
    }

    function requestTexture(mesh, src) {
        if (mesh.userData.requested) return;
        mesh.userData.requested = true;
        if (textureCache.has(src)) {
            applyTexture(mesh, src, textureCache.get(src));
            return;
        }
        loadQueue.push({ mesh: mesh, src: src });
        pumpQueue();
    }

    /* ---------- mesh pool ---------- */
    const pool = [];

    function acquireMesh() {
        const mesh = pool.pop();
        if (mesh) return mesh;
        return new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false
            })
        );
    }

    function releaseMesh(mesh) {
        scene.remove(mesh);
        mesh.material.map = null;
        mesh.material.opacity = 0;
        mesh.userData.src = null;
        mesh.userData.hasTexture = false;
        mesh.userData.requested = false;
        mesh.userData.opacity = 0;
        pool.push(mesh);
    }

    /* ---------- chunks ---------- */
    const chunks = new Map();
    /* The image set the active filter exposes. Layout is independent of it, so
       switching filters reskins the same space instead of rebuilding it. */
    let activePool = images.slice();

    function chunkKey(cx, cy, cz) {
        return cx + "," + cy + "," + cz;
    }

    function buildChunk(cx, cy, cz) {
        const meshes = [];
        if (!activePool.length) return meshes;

        const rng = mulberry32(hashCoords(cx, cy, cz));

        /* Pick ITEMS_PER_CHUNK distinct cells via a deterministic shuffle, so
           every plane lands in its own slice of the chunk. */
        const cellCount = GRID_X * GRID_Y * GRID_Z;
        const count = Math.min(ITEMS_PER_CHUNK, cellCount);
        const cells = [];
        for (let i = 0; i < cellCount; i++) cells.push(i);
        for (let i = cellCount - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = cells[i];
            cells[i] = cells[j];
            cells[j] = tmp;
        }

        for (let i = 0; i < count; i++) {
            const size = PLANE_MIN + rng() * (PLANE_MAX - PLANE_MIN);

            /* Decode the flat cell index into grid coords, then place the plane
               at its cell centre plus a bounded jitter. The chunk's slab is
               centred on its integer coordinate ((c - 0.5 + f) spans
               [c-0.5, c+0.5]), so the field stays symmetric around the camera
               and still tiles seamlessly with neighbouring chunks. */
            const cell = cells[i];
            const gx = cell % GRID_X;
            const gy = Math.floor(cell / GRID_X) % GRID_Y;
            const gz = Math.floor(cell / (GRID_X * GRID_Y));

            const fx = (gx + 0.5 + (rng() - 0.5) * CELL_JITTER) / GRID_X;
            const fy = (gy + 0.5 + (rng() - 0.5) * CELL_JITTER) / GRID_Y;
            const fz = (gz + 0.5 + (rng() - 0.5) * CELL_JITTER) / GRID_Z;

            const px = (cx - 0.5 + fx) * CHUNK_SIZE;
            const py = (cy - 0.5 + fy) * CHUNK_SIZE;
            const pz = (cz - 0.5 + fz) * CHUNK_SIZE;
            const mediaIndex = Math.floor(rng() * 1000000) % activePool.length;

            const mesh = acquireMesh();
            mesh.position.set(px, py, pz);
            mesh.scale.set(size, size, 1);
            mesh.userData.size = size;
            mesh.userData.src = activePool[mediaIndex].src;
            mesh.userData.hasTexture = false;
            mesh.userData.requested = false;
            mesh.userData.opacity = 0;
            mesh.material.opacity = 0;
            mesh.material.map = null;
            mesh.visible = false;

            scene.add(mesh);
            meshes.push(mesh);
        }
        return meshes;
    }

    function updateChunks() {
        const ccx = Math.round(basePos.x / CHUNK_SIZE);
        const ccy = Math.round(basePos.y / CHUNK_SIZE);
        const ccz = Math.round(basePos.z / CHUNK_SIZE);

        for (let dx = -RENDER_X; dx <= RENDER_X; dx++) {
            for (let dy = -RENDER_Y; dy <= RENDER_Y; dy++) {
                for (let dz = -RENDER_Z; dz <= RENDER_Z; dz++) {
                    const cx = ccx + dx;
                    const cy = ccy + dy;
                    const cz = ccz + dz;
                    const key = chunkKey(cx, cy, cz);
                    if (!chunks.has(key)) chunks.set(key, buildChunk(cx, cy, cz));
                }
            }
        }

        chunks.forEach(function (meshes, key) {
            const p = key.split(",");
            if (
                Math.abs(parseInt(p[0], 10) - ccx) > RENDER_X ||
                Math.abs(parseInt(p[1], 10) - ccy) > RENDER_Y ||
                Math.abs(parseInt(p[2], 10) - ccz) > RENDER_Z
            ) {
                meshes.forEach(releaseMesh);
                chunks.delete(key);
            }
        });
    }

    function clearChunks() {
        chunks.forEach(function (meshes) {
            meshes.forEach(releaseMesh);
        });
        chunks.clear();
        loadQueue.length = 0;
    }

    /* ---------- preload + progress ---------- */
    /* Queue every image in the pool as a background job while the black loading
       screen is up (nothing is shown yet — filterFade is still 0). Progress is
       reported so the loading counter can run 0 → 100, and onComplete fires once
       the whole pool has settled, which is what triggers the reveal. */
    function preload(onProgress, onComplete) {
        if (preloadStarted) return;
        preloadStarted = true;
        preloadProgressCb = onProgress;
        preloadCompleteCb = onComplete;

        introSrcSet = new Set();
        for (let i = 0; i < activePool.length; i++) {
            introSrcSet.add(activePool[i].src);
        }
        introTotal = introSrcSet.size;

        if (introTotal === 0) {
            preloadDone = true;
            if (typeof onComplete === "function") onComplete();
            return;
        }

        introSrcSet.forEach(function (src) {
            if (!textureCache.has(src)) loadQueue.push({ mesh: null, src: src });
        });
        pumpQueue();
        reportProgress();
    }

    /* Recount settled images and push progress out; fire completion once. */
    function reportProgress() {
        if (!introSrcSet) return;
        let n = 0;
        introSrcSet.forEach(function (s) {
            if (textureCache.has(s)) n++;
        });
        if (typeof preloadProgressCb === "function") preloadProgressCb(n / introTotal);
        if (n >= introTotal && !preloadDone) {
            preloadDone = true;
            if (typeof preloadCompleteCb === "function") preloadCompleteCb();
        }
    }

    /* ---------- input ---------- */
    /* Camera rests at INITIAL_CAMERA_Z; reveal() drifts it forward from there
       through the field while the images load. Input stays off until the intro
       finalizes, so a stray scroll can't fight the auto-drift for basePos.z. */
    const basePos = { x: 0, y: 0, z: INITIAL_CAMERA_Z };
    const velocity = { x: 0, y: 0, z: 0 };
    const targetVel = { x: 0, y: 0, z: 0 };
    let scrollAccum = 0;
    let dragging = false;
    let inputEnabled = false;
    const lastPointer = { x: 0, y: 0 };

    /* Preload / reveal bookkeeping. Every pool image loads up front (progress
       drives the loading counter); reveal() then runs once, and is guarded so a
       repeat call can't restart the zoom. */
    let preloadStarted = false;
    let preloadDone = false;
    let fadeStarted = false;
    let zoomStarted = false;
    let preloadProgressCb = null;
    let preloadCompleteCb = null;
    let introSrcSet = null;
    let introTotal = 0;

    /* Mouse parallax + first-move handoff */
    const mouse = { x: 0, y: 0 };
    const drift = { x: 0, y: 0 };
    let driftActive = false;
    let firstMoveArmed = false;
    let firstMoveFired = false;

    function onMouseMove(e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);

        if (firstMoveArmed && !firstMoveFired) {
            firstMoveFired = true;
            driftActive = true;
            if (typeof options.onFirstMove === "function") options.onFirstMove();
        }
    }
    window.addEventListener("mousemove", onMouseMove);

    /* Global multiplier GSAP drives for the reveal and filter fades */
    const fadeState = { filterFade: 0 };

    function onPointerDown(e) {
        if (!inputEnabled) return;
        dragging = true;
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        container.classList.add("is-dragging");
        if (e.pointerId !== undefined && renderer.domElement.setPointerCapture) {
            renderer.domElement.setPointerCapture(e.pointerId);
        }
    }

    function onPointerMove(e) {
        if (!dragging) return;
        targetVel.x -= (e.clientX - lastPointer.x) * DRAG_SPEED;
        targetVel.y += (e.clientY - lastPointer.y) * DRAG_SPEED;
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
    }

    function onPointerUp(e) {
        dragging = false;
        container.classList.remove("is-dragging");
        if (e.pointerId !== undefined && renderer.domElement.releasePointerCapture) {
            try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        }
    }

    /* Wheel feeds a scroll accumulator that bleeds into Z velocity, so a flick
       of the wheel carries you forward and coasts to a stop */
    function onWheel(e) {
        e.preventDefault();
        if (!inputEnabled) return;
        scrollAccum += e.deltaY * WHEEL_SPEED;
    }

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    /* ---------- frame loop ---------- */
    let running = true;

    function frame() {
        if (!running) return;
        requestAnimationFrame(frame);

        targetVel.z += scrollAccum;
        scrollAccum *= SCROLL_DECAY;

        targetVel.x = clamp(targetVel.x, -MAX_VELOCITY, MAX_VELOCITY);
        targetVel.y = clamp(targetVel.y, -MAX_VELOCITY, MAX_VELOCITY);
        targetVel.z = clamp(targetVel.z, -MAX_VELOCITY, MAX_VELOCITY);

        velocity.x += (targetVel.x - velocity.x) * VELOCITY_LERP;
        velocity.y += (targetVel.y - velocity.y) * VELOCITY_LERP;
        velocity.z += (targetVel.z - velocity.z) * VELOCITY_LERP;

        basePos.x += velocity.x;
        basePos.y += velocity.y;
        basePos.z += velocity.z;

        targetVel.x *= VELOCITY_DECAY;
        targetVel.y *= VELOCITY_DECAY;
        targetVel.z *= VELOCITY_DECAY;

        /* The reveal zoom is a GSAP tween straight on basePos.z (see reveal()).
           Input is disabled through it, so velocity.z stays ~0 and the two never
           fight over basePos.z. */

        /* Parallax rides on top of basePos; chunk math stays on basePos so the
           drift never trips chunk rebuilds */
        if (driftActive) {
            drift.x += (mouse.x * DRIFT_AMOUNT - drift.x) * DRIFT_LERP;
            drift.y += (mouse.y * DRIFT_AMOUNT - drift.y) * DRIFT_LERP;
        }
        camera.position.set(basePos.x + drift.x, basePos.y + drift.y, basePos.z);

        updateChunks();

        const ccx = Math.round(basePos.x / CHUNK_SIZE);
        const ccy = Math.round(basePos.y / CHUNK_SIZE);
        const ccz = Math.round(basePos.z / CHUNK_SIZE);

        chunks.forEach(function (meshes, key) {
            const p = key.split(",");
            const gridDist = Math.max(
                Math.abs(parseInt(p[0], 10) - ccx) / RENDER_X,
                Math.abs(parseInt(p[1], 10) - ccy) / RENDER_Y,
                Math.abs(parseInt(p[2], 10) - ccz) / RENDER_Z
            );
            const gridFade = clamp(1 - (gridDist - 0.5) / 0.5, 0, 1);

            for (let m = 0; m < meshes.length; m++) {
                const mesh = meshes[m];
                /* Camera looks down -Z, so a plane is in front when its z is
                   less than the camera's. Planes behind get no opacity and no
                   texture — they've been flown past and aren't drawable anyway,
                   so this keeps the load budget on what's ahead. */
                const forward = basePos.z - mesh.position.z;
                const absDepth = Math.abs(mesh.position.z - basePos.z);

                let depthFade;
                if (forward < 0 || absDepth > DEPTH_FADE_END || absDepth < NEAR_FADE_CUT) {
                    /* behind the camera, past the far fade, or so close it would
                       fill the screen — draw nothing */
                    depthFade = 0;
                } else if (absDepth < NEAR_FADE_FULL) {
                    /* ramping up out of the near-fade zone as it recedes */
                    depthFade = (absDepth - NEAR_FADE_CUT) /
                        (NEAR_FADE_FULL - NEAR_FADE_CUT);
                } else if (absDepth > DEPTH_FADE_START) {
                    depthFade = 1 - (absDepth - DEPTH_FADE_START) /
                        (DEPTH_FADE_END - DEPTH_FADE_START);
                } else {
                    depthFade = 1;
                }
                depthFade *= depthFade;

                const target = Math.min(gridFade, depthFade) * fadeState.filterFade;

                /* Only pull a texture once the plane is prominent enough to be
                   worth a download — see REQUEST_THRESHOLD. */
                if (target > REQUEST_THRESHOLD && !mesh.userData.requested) {
                    requestTexture(mesh, mesh.userData.src);
                }

                const reveal = mesh.userData.hasTexture ? target : 0;
                mesh.userData.opacity += (reveal - mesh.userData.opacity) * 0.18;
                mesh.material.opacity = mesh.userData.opacity;
                mesh.visible = mesh.userData.opacity > INVIS_THRESHOLD;
            }
        });

        renderer.render(scene, camera);
    }
    frame();

    /* ---------- public API ---------- */
    return {
        setFilter: function (nextImages) {
            const tl = window.gsap.timeline();
            tl.to(fadeState, { filterFade: 0, duration: 0.45, ease: "power2.in" })
              .call(function () {
                  activePool = nextImages.slice();
                  clearChunks();
                  updateChunks();
              })
              .to(fadeState, { filterFade: 1, duration: 0.7, ease: "power2.out" }, "+=0.05");
            return tl;
        },

        /* Kick off the background preload behind the black loading screen.
           onProgress(fraction 0..1) drives the loading counter; onComplete fires
           once every image has settled, which is what cues the reveal. */
        preload: function (onProgress, onComplete) {
            preload(onProgress, onComplete);
        },

        /* Beat 1: bring the images up (camera still) as the loader collapses. */
        fadeIn: function () {
            if (fadeStarted) return;
            fadeStarted = true;
            window.gsap.to(fadeState, {
                filterFade: 1,
                duration: REVEAL_FADE,
                ease: "power2.out"
            });
        },

        /* Beat 2: fly the camera forward through two chunks. Input unlocks and
           onDone fires when it lands (main flips the overlay to difference then). */
        zoom: function (onDone) {
            if (zoomStarted) return null;
            zoomStarted = true;
            const tl = window.gsap.timeline({
                onComplete: function () {
                    inputEnabled = true;
                    if (typeof onDone === "function") onDone();
                }
            });
            tl.to(basePos, {
                z: basePos.z - REVEAL_ZOOM,
                duration: REVEAL_DURATION,
                ease: "power2.inOut"
            }, 0);
            return tl;
        },

        /* Start watching for the first mouse move; parallax engages from then on */
        armFirstMove: function () {
            firstMoveArmed = true;
        },

        destroy: function () {
            running = false;
            window.removeEventListener("resize", onResize);
            window.removeEventListener("mousemove", onMouseMove);
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerUp);
            el.removeEventListener("pointerleave", onPointerUp);
            el.removeEventListener("wheel", onWheel);
            clearChunks();
            textureCache.forEach(function (t) { if (t) t.dispose(); });
            textureCache.clear();
            geometry.dispose();
            pool.forEach(function (m) { m.material.dispose(); });
            renderer.dispose();
            if (el.parentNode) el.parentNode.removeChild(el);
        }
    };
}
