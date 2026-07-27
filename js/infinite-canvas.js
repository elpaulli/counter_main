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

/* ---------- filter transition (gather -> hold -> swap -> spread) ----------
   Switching filters never blanks the field. Every plane streams to one anchor —
   a different corner of the frame per menu item — shrinking as it goes but
   staying visible, so the field visibly *gathers* into a small cluster there.
   The cluster then sits and holds long enough to read as a deliberate beat.
   Only after that does it pinch out and back in — a fast dip confined to that
   one small corner, which is all the cover the pool swap needs — before the new
   images spread back out of it into a freshly re-seeded layout. */

/* The gather in, and the spread back out. The spread runs longer so the
   outbound half reads as the payoff rather than a rewind. Both ease in *and*
   out: accelerating all the way into the corner is what made this snap. */
const COLLECT_IN = 1.5;
const COLLECT_OUT = 1.5;

/* Fraction of the move spent staggering planes against each other (each plane
   gets a fixed random phase). 0 = every plane moves in lockstep. */
const COLLECT_STAGGER = 0.45;

/* Scale a plane keeps once gathered. Small enough that hundreds of them read as
   one cluster of chips, big enough that they're still legible as photographs. */
const COLLECT_SCALE = 0.12;

/* The gathered cluster is a loose disc, not a single point: each plane keeps a
   fixed offset within it. Without that every plane lands on the same pixel and
   the "pile" is just a smudge. The radius is a fraction of the *smaller* half
   extent of the frame rather than a world distance, so the cluster keeps its
   proportions — and stays inside the frame — on a portrait phone as well as a
   wide desktop. Depth spread stays in world units; it doesn't affect framing. */
const PILE_SPREAD = 0.19;
/* Kept shallow: a tile sitting nearer the camera than the anchor projects
   *further* from centre than its offset suggests, which is what pushes the
   cluster off the frame edge. */
const PILE_DEPTH = 9;

/* The beat at the corner. The cluster holds sharp, then *mixes* — it stirs,
   blurs and dims — and the pool changes at the peak of that, resolving back
   into a sharp cluster afterwards. Swapping behind a straight opacity dip read
   as a cut no matter how short it was; the eye needs the images to look like
   they're being shuffled for the change to disappear into the motion. */
const PILE_HOLD_IN = 0.2;
const CHURN_IN = 0.3;
const CHURN_OUT = 0.3;
const PILE_HOLD_OUT = 0.5;

/* How far the mix turns the cluster (radians, at its centre), and how far each
   tile rotates on its own axis as it goes round. */
const CHURN_SWIRL = 1.5;
const CHURN_TUMBLE = 0.55;

/* Tiles at the centre of the cluster turn through CHURN_CORE times the swirl,
   those at its rim through (CHURN_CORE - 1). Anything above 1 means the pile
   shears through itself instead of turning as a rigid disc — that differential
   is what reads as mixing rather than spinning. */
const CHURN_CORE = 1.35;

/* Peak blur on the canvas, in CSS pixels. Individual tiles are only ~20-30px
   across when gathered, so this is well past the point where they stop being
   legible as separate images — which is the point. */
const BLUR_MAX = 16;

/* How far the cluster dims at the peak of the mix. Deliberately not 0: a
   blackout, however brief, is exactly the cut this is meant to avoid. */
const PINCH_FLOOR = 0.32;

/* Where the anchor sits: this far in front of the camera (inside the solid band
   between NEAR_FADE_FULL and DEPTH_FADE_START), and this far toward the frame
   edge from centre. Pushed no further than PILE_SPREAD (plus a tile's own half
   height) leaves room for — a cluster half off the edge doesn't read as a pile,
   it reads as a bug. */
const ANCHOR_DEPTH = 65;
const ANCHOR_INSET = 0.6;

/* The swap waits for the incoming pool to be this far loaded before the cluster
   fades back in, but never longer than SWAP_MAX_WAIT_S — past that the
   stragglers just arrive late rather than holding the transition hostage. */
const SWAP_READY_FRACTION = 0.6;
const SWAP_MAX_WAIT_S = 1.2;

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
/* `salt` bumps once per filter switch. Within one filter it never changes, so
   chunks stay deterministic — cull one and rebuild it later and it comes back
   identical — but each switch re-seeds the whole space, so the images spread
   back out into a genuinely new arrangement rather than refilling the old one. */
function hashCoords(cx, cy, cz, salt) {
    let h = 2166136261 >>> 0;
    h = Math.imul(h ^ ((cx + 0x9e3779b9) >>> 0), 16777619);
    h = Math.imul(h ^ ((cy + 0x85ebca6b) >>> 0), 16777619);
    h = Math.imul(h ^ ((cz + 0xc2b2ae35) >>> 0), 16777619);
    h = Math.imul(h ^ ((salt + 0x27d4eb2f) >>> 0), 16777619);
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
    /* Sources already queued as background (mesh-less) jobs, so repeated
       prefetch calls — hovering the same menu item twice — don't pile up
       duplicate downloads. */
    const prefetched = new Set();
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
                    /* Sort on the plane's home position, not its rendered one —
                       mid-transition every plane is bunched at the anchor and
                       those coordinates say nothing about what to load first. */
                    const home = j.mesh.userData.home;
                    const dx = home.x - basePos.x;
                    const dy = home.y - basePos.y;
                    const dz = home.z - basePos.z;
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

        /* Keep the image's aspect ratio: the chunk picks a height, width follows.
           Only the ratio is recorded here — the frame loop composes the actual
           scale, since the collect transition shrinks planes on top of it. */
        const image = texture.image;
        if (image && image.height) {
            mesh.userData.aspect = image.width / image.height;
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
        mesh.userData.aspect = 1;
        pool.push(mesh);
    }

    /* ---------- chunks ---------- */
    const chunks = new Map();
    /* The image set the active filter exposes. */
    let activePool = images.slice();
    /* Re-seeds the whole layout on every filter switch — see hashCoords. */
    let layoutSalt = 0;

    function chunkKey(cx, cy, cz) {
        return cx + "," + cy + "," + cz;
    }

    function buildChunk(cx, cy, cz) {
        const meshes = [];
        if (!activePool.length) return meshes;

        const rng = mulberry32(hashCoords(cx, cy, cz, layoutSalt));

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
            /* Fixed per plane: its place in the collect/spread stagger, so the
               field gathers and scatters in waves instead of as one block. */
            const phase = rng();

            /* And its spot in the gathered cluster, as a point in the unit disc
               — the frame loop scales it to the viewport. sqrt() on the radius
               spreads the points evenly instead of crowding them at the centre. */
            const pileAngle = rng() * Math.PI * 2;
            const pileRadius = Math.sqrt(rng());
            /* Which way, and how fast, this tile tumbles during the mix. */
            const pileSpin = (rng() * 2 - 1) * CHURN_TUMBLE;

            const mesh = acquireMesh();
            mesh.position.set(px, py, pz);
            mesh.scale.set(size, size, 1);
            /* Home is the plane's real place in the world. mesh.position is a
               render-time value the transition slides toward the anchor, so all
               world reasoning — depth fade, load priority — reads home. */
            mesh.userData.home = { x: px, y: py, z: pz };
            mesh.userData.pile = {
                x: Math.cos(pileAngle) * pileRadius,
                y: Math.sin(pileAngle) * pileRadius,
                z: (rng() - 0.5) * PILE_DEPTH,
                r: pileRadius,
                spin: pileSpin
            };
            mesh.userData.phase = phase;
            mesh.userData.aspect = 1;
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
        /* Drop the per-plane jobs — those planes are gone — but keep the
           mesh-less prefetch jobs: during a filter switch those *are* the
           incoming pool, queued while the outgoing images were still
           collecting, and dropping them would restart the download from zero. */
        for (let i = loadQueue.length - 1; i >= 0; i--) {
            if (loadQueue[i].mesh) loadQueue.splice(i, 1);
        }
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

        prefetchSources(activePool);
        reportProgress();
    }

    /* Queue a whole image list as background jobs. Used for the intro preload
       and, on menu hover / selection, to pull the next filter's pool while the
       current one is still on screen — so the spread has something to show. */
    function prefetchSources(list) {
        for (let i = 0; i < list.length; i++) {
            const src = list[i].src;
            if (textureCache.has(src) || prefetched.has(src)) continue;
            prefetched.add(src);
            loadQueue.push({ mesh: null, src: src });
        }
        pumpQueue();
    }

    /* Enough of `list` decoded to start the spread without it reading as a
       field of blanks filling in. */
    function poolReady(list) {
        if (!list.length) return true;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            if (textureCache.has(list[i].src)) n++;
        }
        return n / list.length >= SWAP_READY_FRACTION;
    }

    function whenPoolReady(list, cb) {
        const deadline = performance.now() + SWAP_MAX_WAIT_S * 1000;
        const id = setInterval(function () {
            if (poolReady(list) || performance.now() >= deadline) {
                clearInterval(id);
                cb();
            }
        }, 60);
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

    /* Global multiplier GSAP drives for the reveal fade */
    const fadeState = { filterFade: 0 };

    /* Filter transition state, all driven by GSAP:
         p      — the 0→1→0 gather progress.
         swirl  — how far the gathered cluster has stirred (radians).
         blur   — canvas blur in CSS px.
         pinch  — opacity multiplier at the peak of the mix.
       swirl / blur / pinch are separate from `p` because the cluster has to stay
       parked and visible at p === 1 while all three do their work; that beat is
       what hides the pool swap.
       `anchorNdc` is where the images gather, in normalised screen coords
       (-1..1, y up), so each menu item can claim its own corner; the world point
       is recomputed off the live camera every frame, which keeps the cluster
       pinned to that corner of the frame even as the camera moves under it. */
    const collect = { p: 0, pinch: 1, swirl: 0, blur: 0 };

    /* Peak blur is eased off on touch hardware, where a full-viewport filter is
       the most expensive thing on screen. */
    const blurPeak = isTouch ? BLUR_MAX * 0.55 : BLUR_MAX;

    /* The blur rides on the canvas element rather than the material: the whole
       field is gathered into the cluster when it applies, so blurring the layer
       and blurring the images are the same picture — and this way it costs one
       compositor property instead of a shader. Only written when it actually
       changes, and dropped entirely at 0 so no filter layer outlives the move. */
    let appliedBlur = -1;
    function applyBlur(px) {
        const v = Math.round(px * 4) / 4;
        if (v === appliedBlur) return;
        appliedBlur = v;
        renderer.domElement.style.filter = v > 0.05 ? "blur(" + v + "px)" : "";
    }
    const anchorNdc = { x: 0, y: 0 };
    const anchorWorld = { x: 0, y: 0, z: 0 };

    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    /* One plane's share of the global progress. Planes with a low phase lead the
       gather and trail the scatter, which is what turns a uniform slide into a
       stream. */
    function meshCollect(phase) {
        const t = (collect.p - phase * COLLECT_STAGGER) / (1 - COLLECT_STAGGER);
        return smoothstep(clamp(t, 0, 1));
    }

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

        /* Where the gathered cluster sits this frame: ANCHOR_DEPTH ahead of the
           camera, pushed out toward whichever frame edge the menu item asked
           for, with the cluster sized off the frame's smaller half extent.
           Measured from camera.position, not basePos — parallax drift has
           already been folded into the camera by this point, and anchoring to
           basePos instead would let the cluster slide a good fraction of the
           frame away from its corner (far enough to hang off the edge) as the
           pointer moves. */
        const halfH = Math.tan((CAMERA_FOV * 0.5) * Math.PI / 180) * ANCHOR_DEPTH;
        const halfW = halfH * camera.aspect;
        const pileScale = Math.min(halfW, halfH) * PILE_SPREAD;
        anchorWorld.x = camera.position.x + anchorNdc.x * halfW * ANCHOR_INSET;
        anchorWorld.y = camera.position.y + anchorNdc.y * halfH * ANCHOR_INSET;
        anchorWorld.z = camera.position.z - ANCHOR_DEPTH;

        const collecting = collect.p > 0;

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
                const home = mesh.userData.home;
                /* Camera looks down -Z, so a plane is in front when its z is
                   less than the camera's. Planes behind get no opacity and no
                   texture — they've been flown past and aren't drawable anyway,
                   so this keeps the load budget on what's ahead.
                   Depth is measured from home, not the rendered position: a
                   plane collapsing toward the anchor must keep the visibility it
                   had where it lives, or it would blink out mid-flight. */
                const forward = basePos.z - home.z;
                const absDepth = Math.abs(home.z - basePos.z);

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

                /* Gather: slide the plane from home to its own spot in the
                   cluster and shrink it, holding full opacity the whole way —
                   the images gather, they don't dissolve. */
                const ct = collecting ? meshCollect(mesh.userData.phase) : 0;
                const shrink = 1 - ct * (1 - COLLECT_SCALE);
                const pile = mesh.userData.pile;

                /* Mix: turn the tile's place in the cluster around the anchor,
                   further at the centre than at the rim, and tumble it on its
                   own axis as it goes. */
                let pileX = pile.x;
                let pileY = pile.y;
                if (collect.swirl !== 0) {
                    const a = collect.swirl * (CHURN_CORE - pile.r);
                    const cos = Math.cos(a);
                    const sin = Math.sin(a);
                    pileX = pile.x * cos - pile.y * sin;
                    pileY = pile.x * sin + pile.y * cos;
                }
                /* Scaled by ct so the tumble belongs to the cluster and nothing
                   else: it unwinds as the plane flies back out and is exactly 0
                   once it's home. Without that the swirl's final value would
                   leave the whole settled field sitting at a tilt. */
                mesh.rotation.z = collect.swirl * pile.spin * ct;

                mesh.position.set(
                    home.x + (anchorWorld.x + pileX * pileScale - home.x) * ct,
                    home.y + (anchorWorld.y + pileY * pileScale - home.y) * ct,
                    home.z + (anchorWorld.z + pile.z - home.z) * ct
                );
                mesh.scale.set(
                    mesh.userData.size * mesh.userData.aspect * shrink,
                    mesh.userData.size * shrink,
                    1
                );

                const reveal = mesh.userData.hasTexture ? target : 0;
                mesh.userData.opacity += (reveal - mesh.userData.opacity) * 0.18;
                /* The pinch is applied after the smoothing lerp, never through
                   it: the lerp is there to ease chunk and depth fades, and
                   running the swap dip through it would leave planes still
                   faintly visible at the moment the pool changes underneath. */
                mesh.material.opacity = mesh.userData.opacity * collect.pinch;
                mesh.visible = mesh.material.opacity > INVIS_THRESHOLD;
            }
        });

        applyBlur(collect.blur);
        renderer.render(scene, camera);
    }
    frame();

    /* ---------- public API ---------- */
    return {
        /* Switch the visible pool. `anchor` is [x, y] in normalised screen
           coords (-1..1, y up) — the corner this menu item gathers into; omit
           it for centre. The field never blanks: it gathers into a cluster at
           that corner, holds there, swaps behind a short dip, and scatters back
           out into a re-seeded layout. Returns the timeline so the menu can stay
           locked until it lands. */
        setFilter: function (nextImages, anchor) {
            /* Start the download now, while the outgoing images still have the
               whole gather and hold to play out — that head start is most of
               what the spread needs to come back full. */
            prefetchSources(nextImages);

            const tl = window.gsap.timeline();
            let swapped = false;

            tl.set(anchorNdc, {
                x: anchor ? anchor[0] : 0,
                y: anchor ? anchor[1] : 0
            });
            tl.set(collect, { pinch: 1, swirl: 0, blur: 0 });

            /* 1. Gather into the corner — visible the whole way in. */
            tl.fromTo(collect, { p: 0 },
                { p: 1, duration: COLLECT_IN, ease: "power2.inOut" });

            /* 2. Sit there sharp for a beat (the "+=" gap), then mix: one
                  continuous stir spanning the swap, with the blur and the dim
                  peaking exactly where the pool changes. The stir is deliberately
                  a single monotonic tween across both halves — reversing it would
                  read as the cluster un-mixing, which is its own kind of cut. */
            tl.addLabel("mix", "+=" + PILE_HOLD_IN);
            tl.to(collect, {
                swirl: CHURN_SWIRL,
                duration: CHURN_IN + CHURN_OUT,
                ease: "power2.inOut"
            }, "mix");
            tl.to(collect, {
                blur: blurPeak,
                pinch: PINCH_FLOOR,
                duration: CHURN_IN,
                ease: "power2.in"
            }, "mix");

            /* 3. Swap at the peak of the mix — blurred past legibility, dimmed,
                  and still turning. */
            tl.call(function () {
                /* Guarded: resuming a paused timeline can re-render the playhead
                   position the pause happened at, and the swap must not run twice. */
                if (swapped) return;
                swapped = true;

                activePool = nextImages.slice();
                /* New seed => the images scatter into a new arrangement rather
                   than dropping back into the outgoing set's slots. */
                layoutSalt = (layoutSalt + 1) >>> 0;
                clearChunks();
                updateChunks();

                /* Hold in the mix until enough of the new pool has decoded, so
                   the cluster resolves carrying images rather than empty
                   planes. Freezing here is cheap: blurred and mid-stir is a
                   perfectly good place to wait. */
                if (poolReady(activePool)) return;
                tl.pause();
                whenPoolReady(activePool, function () { tl.play(); });
            }, null, "mix+=" + CHURN_IN);

            /* 4. Resolve out of the mix — the stir is still running under this,
                  so the new cluster settles rather than snapping into focus. */
            tl.to(collect, {
                blur: 0,
                pinch: 1,
                duration: CHURN_OUT,
                ease: "power2.out"
            }, "mix+=" + CHURN_IN);

            /* 5. Spread back out, after a gap that lets the new cluster register
                  as itself before it flies apart. */
            tl.to(collect, { p: 0, duration: COLLECT_OUT, ease: "power2.inOut" },
                "mix+=" + (CHURN_IN + CHURN_OUT + PILE_HOLD_OUT));
            return tl;
        },

        /* Warm the cache for a pool that hasn't been chosen yet (menu hover). */
        prefetch: function (list) {
            prefetchSources(list);
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
            applyBlur(0);
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
