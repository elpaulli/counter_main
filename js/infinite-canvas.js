/* ============================================
   COUNTER- CLT — INFINITE CANVAS
   ============================================ */

import * as THREE from "three";
import { loadButterflyMasks, BUTTERFLY_COUNT } from "./butterfly-masks.js";

const CHUNK_SIZE = 90;

const RENDER_X = 2;
const RENDER_Y = 2;
const RENDER_Z = 2;
const ITEMS_PER_CHUNK = 5;

const GRID_X = 3;
const GRID_Y = 3;
const GRID_Z = 2;

const CELL_JITTER = 0.55;

const PLANE_MIN = 14;
const PLANE_MAX = 25;

const INITIAL_CAMERA_Z = 40;
const CAMERA_FOV = 60;

const DEPTH_FADE_START = 80;
const DEPTH_FADE_END = 250;

const NEAR_FADE_CUT = 20;
const NEAR_FADE_FULL = 55;

const REVEAL_FADE = 0.8;
const REVEAL_DURATION = 1.6;
const REVEAL_ZOOM = 2 * CHUNK_SIZE;

const COLLECT_IN = 1.5;
const COLLECT_OUT = 1.5;

const COLLECT_STAGGER = 0.45;

const COLLECT_SCALE = 0.12;

const PILE_SPREAD = 0.19;

const PILE_DEPTH = 9;

const PILE_HOLD_IN = 0.2;
const CHURN_IN = 0.3;
const CHURN_OUT = 0.3;
const PILE_HOLD_OUT = 0.5;

const CHURN_SWIRL = 1.5;
const CHURN_TUMBLE = 0.55;

const CHURN_CORE = 1.35;

const ARRANGE_OUT = 0.42;
const ARRANGE_IN = 0.95;

const ARRANGE_SLIDE = 90;

const REEL_AUTO_RATE = 9;

const BLUR_MAX = 16;

const PINCH_FLOOR = 0.32;

const ANCHOR_DEPTH = 65;
const ANCHOR_INSET = 0.6;

const SWAP_READY_FRACTION = 0.6;
const SWAP_MAX_WAIT_S = 1.2;

const REEL_PATH = "M 46 0 C 56 28, 56 72, 46 100";

const REEL_SPINE_SAMPLES = 256;

const REEL_SPAN = 2.8;

const REEL_BOX_VERTICAL = {
    along: 0.62, cross: 0.40, inset: 0.46, gap: 0.19, snug: false
};
const REEL_BOX_HORIZONTAL = {
    along: 0.30, cross: 0.46, inset: 0.38, gap: 0.06, snug: true
};

const REEL_BOX_CENTER = {
    along: 0.44, cross: 0.46, inset: 0, gap: 0.06, snug: true
};

const REEL_BOX_DIAGONAL = {
    along: 0.30, cross: 0.30, inset: 0, gap: 0.06, snug: true
};

function reelBoxFor(side) {
    if (side === "center") return REEL_BOX_CENTER;
    if (side === "diagonal") return REEL_BOX_DIAGONAL;
    if (side === "left" || side === "right") return REEL_BOX_VERTICAL;
    return REEL_BOX_HORIZONTAL;
}

const SQ = Math.SQRT1_2;
function reelAxes(side) {
    if (side === "left" || side === "right") {
        return { ax: 0, ay: 1, cx: 1, cy: 0 };
    }
    if (side === "diagonal") {

        return { ax: SQ, ay: SQ, cx: -SQ, cy: SQ };
    }
    return { ax: 1, ay: 0, cx: 0, cy: 1 };
}

const REEL_DEPTH = 65;

const REEL_TILT = 0.4;

const FOCUS_IN = 0.75;
const FOCUS_OUT = 0.55;

const FOCUS_DEPTH = 60;
const FOCUS_FILL_H = 0.92;
const FOCUS_FILL_W = 0.94;

const CLICK_SLOP = 6;
const CLICK_MS = 450;

const PICK_MIN_OPACITY = 0.3;

const MASK_SOFT_MIN = 0.02;
const MASK_OPEN = -0.12;

const MASK_OUTSIDE = 0.6;

const MASK_FRAGMENT = [
    "#ifdef USE_ALPHAMAP",
    "	vec2 maskUv = ( vAlphaMapUv - 0.5 ) * uMaskFit + 0.5;",
    "	vec2 maskOver = max( abs( maskUv - 0.5 ) - 0.5, 0.0 );",
    "	float maskDist = texture2D( alphaMap, clamp( maskUv, 0.0, 1.0 ) ).r;",
    "	maskDist = max( maskDist - length( maskOver ) * " + MASK_OUTSIDE.toFixed(3) + ", 0.0 );",
    "	float maskEdge = mix( 0.5, " + MASK_OPEN.toFixed(3) + ", uReveal );",
    "	float maskAA = max( fwidth( maskDist ), " + MASK_SOFT_MIN.toFixed(4) + " );",
    "	diffuseColor.a *= smoothstep( maskEdge - maskAA, maskEdge + maskAA, maskDist );",
    "#endif"
].join("\n");

const DRAG_SPEED = 0.05;
const WHEEL_SPEED = 0.05;
const MAX_VELOCITY = 4.5;
const VELOCITY_LERP = 0.16;
const VELOCITY_DECAY = 0.9;
const SCROLL_DECAY = 0.8;
const INVIS_THRESHOLD = 0.01;

const DRIFT_AMOUNT = 9;
const DRIFT_LERP = 0.06;

const MAX_CONCURRENT_LOADS = 6;

const WARM_BATCH = 4;

const TEXTURE_CACHE_LIMIT_DESKTOP = 90;
const TEXTURE_CACHE_LIMIT_TOUCH = 36;
const TEXTURE_MAX_EDGE_DESKTOP = 1280;
const TEXTURE_MAX_EDGE_TOUCH = 1024;

const REQUEST_THRESHOLD = 0.12;

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

function parsePath(d) {
    const t = d.match(/[MmCc]|-?\d*\.?\d+/g);
    if (!t) return null;
    const segs = [];
    let i = 0;
    let cx = 0;
    let cy = 0;
    let cmd = null;
    while (i < t.length) {
        if (/[MmCc]/.test(t[i])) {
            cmd = t[i];
            i++;
        }
        const n = function () { return parseFloat(t[i++]); };
        if (cmd === "M" || cmd === "m") {
            const x = n();
            const y = n();
            cx = cmd === "m" ? cx + x : x;
            cy = cmd === "m" ? cy + y : y;

            cmd = null;
            if (i < t.length && !/[MmCc]/.test(t[i])) return null;
        } else if (cmd === "C" || cmd === "c") {
            const rel = cmd === "c";
            const ox = rel ? cx : 0;
            const oy = rel ? cy : 0;
            const x1 = ox + n();
            const y1 = oy + n();
            const x2 = ox + n();
            const y2 = oy + n();
            const x3 = ox + n();
            const y3 = oy + n();
            segs.push({ x0: cx, y0: cy, x1: x1, y1: y1, x2: x2, y2: y2, x3: x3, y3: y3 });
            cx = x3;
            cy = y3;
        } else {
            return null;
        }
    }
    return segs.length ? segs : null;
}

function buildSpine(d, samples) {
    const segs = parsePath(d);
    const xs = new Float64Array(samples + 1);
    const ys = new Float64Array(samples + 1);
    if (!segs) {

        for (let i = 0; i <= samples; i++) {
            xs[i] = 50;
            ys[i] = (i / samples) * 100;
        }
        return { xs: xs, ys: ys };
    }
    for (let i = 0; i <= samples; i++) {
        const st = (i / samples) * segs.length;
        const si = Math.min(Math.floor(st), segs.length - 1);
        const lt = st - si;
        const s = segs[si];
        const mt = 1 - lt;
        const a = mt * mt * mt;
        const b = 3 * mt * mt * lt;
        const c = 3 * mt * lt * lt;
        const e = lt * lt * lt;
        xs[i] = a * s.x0 + b * s.x1 + c * s.x2 + e * s.x3;
        ys[i] = a * s.y0 + b * s.y1 + c * s.y2 + e * s.y3;
    }
    return { xs: xs, ys: ys };
}

function spineX(spine, y) {
    const ys = spine.ys;
    const xs = spine.xs;
    const last = ys.length - 1;
    if (y <= ys[0]) return xs[0];
    if (y >= ys[last]) return xs[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ys[mid] <= y) lo = mid;
        else hi = mid;
    }
    const span = ys[hi] - ys[lo];
    const f = span > 1e-9 ? (y - ys[lo]) / span : 0;
    return xs[lo] + (xs[hi] - xs[lo]) * f;
}

const REEL_SPINE = buildSpine(REEL_PATH, REEL_SPINE_SAMPLES);

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
    const TEXTURE_CACHE_LIMIT = isTouch ? TEXTURE_CACHE_LIMIT_TOUCH : TEXTURE_CACHE_LIMIT_DESKTOP;
    const TEXTURE_MAX_EDGE = isTouch ? TEXTURE_MAX_EDGE_TOUCH : TEXTURE_MAX_EDGE_DESKTOP;
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

    const loader = new THREE.TextureLoader();
    const textureCache = new Map();

    const textureLastUsed = new Map();
    let lruClock = 0;
    const loadQueue = [];
    const inflight = new Map();

    const badSources = new Set();
    let activeLoads = 0;

    function reassignBadPlane(mesh) {
        if (!activePool.length || badSources.size >= activePool.length) return;
        for (let i = 0; i < 10; i++) {
            const alt = activePool[(Math.random() * activePool.length) | 0].src;
            if (badSources.has(alt) || alt === mesh.userData.src) continue;
            mesh.userData.src = alt;
            mesh.userData.requested = false;
            mesh.userData.hasTexture = false;
            return;
        }
    }

    function shrinkTexture(texture) {
        const img = texture.image;
        if (!img || !img.width || !img.height) return;

        const longest = Math.max(img.width, img.height);
        if (longest <= TEXTURE_MAX_EDGE) return;

        const ratio = TEXTURE_MAX_EDGE / longest;
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * ratio));
        cv.height = Math.max(1, Math.round(img.height * ratio));

        const ctx = cv.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, cv.width, cv.height);

        texture.image = cv;
        texture.needsUpdate = true;
    }

    function releaseSource(texture) {
        const img = texture.image;
        if (!img) return;
        const w = img.width;
        const h = img.height;
        if (img instanceof HTMLCanvasElement) {
            img.width = 0;
            img.height = 0;
        }
        texture.image = { width: w, height: h };
    }

    function pumpQueue() {
        while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length) {
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
            if (bestIdx === -1) {
                if (!loadQueue.length) break;
                bestIdx = 0;
            }
            const job = loadQueue.splice(bestIdx, 1)[0];

            if (inflight.has(job.src)) {
                if (job.mesh) inflight.get(job.src).push(job.mesh);
                continue;
            }
            inflight.set(job.src, job.mesh ? [job.mesh] : []);

            activeLoads++;
            loader.load(
                job.src,
                function (texture) {
                    activeLoads--;
                    const waiters = inflight.get(job.src) || [];
                    inflight.delete(job.src);

                    const existing = textureCache.get(job.src);
                    if (existing) {
                        texture.dispose();
                        texture = existing;
                    } else {
                        shrinkTexture(texture);
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.generateMipmaps = true;
                        texture.minFilter = THREE.LinearMipmapLinearFilter;
                        try {
                            renderer.initTexture(texture);
                            releaseSource(texture);
                        } catch (e) {}
                        textureCache.set(job.src, texture);
                    }

                    textureLastUsed.set(job.src, ++lruClock);
                    for (let i = 0; i < waiters.length; i++) applyTexture(waiters[i], job.src, texture);
                    reportProgress();
                    pumpQueue();
                    pumpWarm();
                    trimTextureCache();
                },
                undefined,
                function () {
                    activeLoads--;
                    const waiters = inflight.get(job.src) || [];
                    inflight.delete(job.src);
                    textureCache.set(job.src, null);

                    badSources.add(job.src);
                    for (let i = 0; i < waiters.length; i++) {
                        if (waiters[i].userData.src === job.src) reassignBadPlane(waiters[i]);
                    }
                    reportProgress();
                    pumpQueue();
                    pumpWarm();
                }
            );
        }
    }

    function applyTexture(mesh, src, texture) {
        if (!texture || mesh.userData.src !== src) return;
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
        mesh.userData.hasTexture = true;
        textureLastUsed.set(src, ++lruClock);
        const image = texture.image;
        if (image && image.height) {
            mesh.userData.aspect = image.width / image.height;
        }
    }

    function collectActiveSources() {
        const active = new Set();
        for (let i = 0; i < activePool.length; i++) active.add(activePool[i].src);
        for (let i = 0; i < incomingPool.length; i++) active.add(incomingPool[i].src);
        chunks.forEach(function (meshes) {
            for (let i = 0; i < meshes.length; i++) {
                if (meshes[i].userData.src) active.add(meshes[i].userData.src);
            }
        });
        for (let i = 0; i < reelItems.length; i++) {
            if (reelItems[i].userData.src) active.add(reelItems[i].userData.src);
        }
        return active;
    }

    function trimTextureCache() {

        let live = 0;
        textureCache.forEach(function (texture) { if (texture) live++; });
        if (live <= TEXTURE_CACHE_LIMIT) return;

        const active = collectActiveSources();
        const candidates = [];
        textureCache.forEach(function (texture, src) {
            if (!texture || active.has(src)) return;
            candidates.push(src);
        });
        candidates.sort(function (a, b) {
            return (textureLastUsed.get(a) || 0) - (textureLastUsed.get(b) || 0);
        });
        let over = live - TEXTURE_CACHE_LIMIT;
        for (let i = 0; i < candidates.length && over > 0; i++) {
            const src = candidates[i];
            textureCache.get(src).dispose();
            textureCache.delete(src);
            textureLastUsed.delete(src);
            over--;
        }
    }

    function requestTexture(mesh, src) {
        if (mesh.userData.requested) return;

        if (textureCache.has(src)) {
            const cached = textureCache.get(src);
            if (cached) {
                mesh.userData.requested = true;
                applyTexture(mesh, src, cached);
            } else {

                reassignBadPlane(mesh);
            }
            return;
        }

        mesh.userData.requested = true;
        loadQueue.push({ mesh: mesh, src: src });
        pumpQueue();
    }

    const pool = [];

    function acquireMesh() {
        const mesh = pool.pop();
        if (mesh) return mesh;

        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        });

        material.extensions = { derivatives: true };
        material.onBeforeCompile = function (shader) {
            shader.uniforms.uReveal = { value: 0 };
            shader.uniforms.uMaskFit = { value: new THREE.Vector2(1, 1) };
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <alphamap_pars_fragment>",
                         "#include <alphamap_pars_fragment>\n" +
                         "uniform float uReveal;\nuniform vec2 uMaskFit;")
                .replace("#include <alphamap_fragment>", MASK_FRAGMENT);
            material.userData.shader = shader;
        };

        return new THREE.Mesh(geometry, material);
    }

    function updateMask(mesh, reveal) {
        mesh.userData.reveal = reveal;

        const shader = mesh.material.userData.shader;
        if (!shader) return;
        shader.uniforms.uReveal.value = reveal;

        const fit = shader.uniforms.uMaskFit.value;
        const mask = mesh.material.alphaMap ? maskFor(mesh) : null;
        if (!mask) {
            fit.set(1, 1);
            return;
        }

        const aspect = mesh.userData.aspect || 1;
        const side = Math.min(aspect / mask.w, 1 / mask.h);
        fit.set(aspect / side, 1 / side);
    }

    function releaseMesh(mesh) {
        if (mesh === focusMesh) cancelFocus();
        scene.remove(mesh);
        mesh.material.map = null;
        mesh.material.opacity = 0;
        mesh.userData.src = null;
        mesh.userData.hasTexture = false;
        mesh.userData.requested = false;
        mesh.userData.opacity = 0;
        mesh.userData.aspect = 1;
        mesh.userData.lean = 0;
        mesh.rotation.z = 0;
        updateMask(mesh, 0);
        pool.push(mesh);
    }

    let masks = [];

    function maskFor(mesh) {
        const i = mesh.userData.mask;
        return (i == null || !masks.length) ? null : masks[i % masks.length];
    }

    function applyMask(mesh) {
        const mask = selectEnabled ? maskFor(mesh) : null;
        const next = mask ? mask.texture : null;
        if (mesh.material.alphaMap === next) return;
        const toggled = Boolean(mesh.material.alphaMap) !== Boolean(next);
        mesh.material.alphaMap = next;
        if (toggled) mesh.material.needsUpdate = true;
    }

    function maskHit(mesh, uv) {
        if (!uv || mesh.userData.reveal > 0.5) return true;
        const mask = maskFor(mesh);
        if (!mask) return true;

        const s = mask.size;
        const x = Math.min(s - 1, Math.max(0, Math.floor(uv.x * s)));
        const y = Math.min(s - 1, Math.max(0, Math.floor(uv.y * s)));
        return mask.pick[y * s + x] > 128;
    }

    const chunks = new Map();
    let activePool = images.slice();

    let incomingPool = [];
    let layoutSalt = 0;

    function chunkKey(cx, cy, cz) {
        return cx + "," + cy + "," + cz;
    }

    function buildChunk(cx, cy, cz) {
        const meshes = [];
        if (!activePool.length) return meshes;

        const rng = mulberry32(hashCoords(cx, cy, cz, layoutSalt));
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
            const phase = rng();
            const pileAngle = rng() * Math.PI * 2;
            const pileRadius = Math.sqrt(rng());
            const pileSpin = (rng() * 2 - 1) * CHURN_TUMBLE;
            const maskIndex = Math.floor(rng() * BUTTERFLY_COUNT);

            const mesh = acquireMesh();
            mesh.position.set(px, py, pz);
            mesh.scale.set(size, size, 1);
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
            mesh.userData.lean = 0;
            mesh.userData.size = size;
            mesh.userData.src = activePool[mediaIndex].src;
            mesh.userData.hasTexture = false;
            mesh.userData.requested = false;
            mesh.userData.opacity = 0;
            mesh.userData.mask = maskIndex;
            mesh.material.opacity = 0;
            mesh.material.map = null;
            mesh.visible = false;
            updateMask(mesh, 0);
            applyMask(mesh);

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

    let reelActive = false;

    let reelSideWanted = "right";
    let reelSide = "right";
    const reelItems = [];

    let reelAutoRate = 0;
    let reelStart = null;
    let reelSlot = null;
    let reelSize = null;
    const reelScroll = { pos: 0, vel: 0, targetVel: 0, accum: 0 };

    function buildReel() {
        clearReel();
        if (!activePool.length) return;

        const rng = mulberry32(hashCoords(0, 0, 0, layoutSalt));
        for (let i = 0; i < activePool.length; i++) {
            const pileAngle = rng() * Math.PI * 2;
            const pileRadius = Math.sqrt(rng());

            const mesh = acquireMesh();
            mesh.userData.home = { x: 0, y: 0, z: 0 };
            mesh.userData.pile = {
                x: Math.cos(pileAngle) * pileRadius,
                y: Math.sin(pileAngle) * pileRadius,
                z: (rng() - 0.5) * PILE_DEPTH,
                r: pileRadius,
                spin: (rng() * 2 - 1) * CHURN_TUMBLE
            };
            mesh.userData.phase = rng();
            mesh.userData.aspect = 1;
            mesh.userData.size = 1;
            mesh.userData.reelIndex = i;
            mesh.userData.src = activePool[i].src;
            mesh.userData.hasTexture = false;
            mesh.userData.requested = false;
            mesh.userData.opacity = 0;
            mesh.userData.mask = Math.floor(rng() * BUTTERFLY_COUNT);
            mesh.material.opacity = 0;
            mesh.material.map = null;
            mesh.visible = false;
            updateMask(mesh, 0);
            applyMask(mesh);

            scene.add(mesh);
            reelItems.push(mesh);
        }
        reelStart = new Float64Array(reelItems.length);
        reelSlot = new Float64Array(reelItems.length);
        reelSize = new Float64Array(reelItems.length);

        reelScroll.pos = 0;
        reelScroll.vel = 0;
        reelScroll.targetVel = 0;
        reelScroll.accum = 0;
    }

    function clearReel() {
        for (let i = 0; i < reelItems.length; i++) releaseMesh(reelItems[i]);
        reelItems.length = 0;
    }

    function applyReelSide() {
        reelSide = window.matchMedia("(max-width: 900px)").matches
            ? "bottom"
            : reelSideWanted;
    }

    function reelIsVertical() {
        return reelSide === "left" || reelSide === "right";
    }

    let selectEnabled = true;
    let focusMesh = null;
    let focusZoomed = false;
    const focus = { amount: 0 };
    const raycaster = new THREE.Raycaster();
    const pickNdc = new THREE.Vector2();
    const pickList = [];
    const projected = new THREE.Vector3();
    const focusTarget = { x: 0, y: 0, z: 0 };
    let focusMaxH = 0;
    let focusMaxW = 0;
    let indicatorShown = false;
    const pressStart = { x: 0, y: 0, t: 0 };

    function pickMesh(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        pickNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pickNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(pickNdc, camera);

        pickList.length = 0;
        chunks.forEach(function (meshes) {
            for (let i = 0; i < meshes.length; i++) {
                const m = meshes[i];
                if (m.visible && m.material.opacity >= PICK_MIN_OPACITY) pickList.push(m);
            }
        });

        const hits = raycaster.intersectObjects(pickList, false);
        for (let i = 0; i < hits.length; i++) {
            if (maskHit(hits[i].object, hits[i].uv)) return hits[i].object;
        }
        return null;
    }

    function handleClick(e) {
        if (focusZoomed) {
            exitFocus();
            return;
        }
        if (!selectEnabled || !inputEnabled) return;

        const hit = pickMesh(e);
        if (!hit) {
            focusMesh = null;
        } else if (hit === focusMesh) {
            enterFocus();
        } else {
            focusMesh = hit;
        }
    }

    function enterFocus() {
        if (focusZoomed || !focusMesh) return;
        focusZoomed = true;
        inputEnabled = false;
        focusMesh.renderOrder = 1;
        if (typeof options.onFocusChange === "function") options.onFocusChange(true);
        window.gsap.to(focus, { amount: 1, duration: FOCUS_IN, ease: "power3.out" });
    }

    function exitFocus() {
        if (!focusZoomed) return;
        focusZoomed = false;
        if (typeof options.onFocusChange === "function") options.onFocusChange(false);
        window.gsap.to(focus, {
            amount: 0,
            duration: FOCUS_OUT,
            ease: "power2.inOut",
            onComplete: function () {
                if (focusMesh) focusMesh.renderOrder = 0;
                focusMesh = null;
                inputEnabled = true;
            }
        });
    }

    function cancelFocus() {
        window.gsap.killTweensOf(focus);
        focus.amount = 0;
        if (focusMesh) {
            focusMesh.renderOrder = 0;
            focusMesh = null;
        }
        if (focusZoomed) {
            focusZoomed = false;
            inputEnabled = true;
            if (typeof options.onFocusChange === "function") options.onFocusChange(false);
        }
    }

    function updateFocusIndicator() {
        const el = options.focusIndicator;
        if (!el) return;

        const show = Boolean(focusMesh) && !focusZoomed && focus.amount < 0.01;
        if (!show) {
            if (indicatorShown) {
                el.classList.remove("is-visible");
                indicatorShown = false;
            }
            return;
        }

        projected.copy(focusMesh.position).project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
        el.style.transform =
            "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%)";
        if (!indicatorShown) {
            el.classList.add("is-visible");
            indicatorShown = true;
        }
    }

    function layoutReel(halfW, halfH) {
        const n = reelItems.length;
        if (!n) return;

        const vertical = reelSide === "left" || reelSide === "right";
        const diagonal = reelSide === "diagonal";

        const crossSign = (reelSide === "right" || reelSide === "top") ? 1 : -1;

        const ax = reelAxes(reelSide);

        const halfAlong = halfW * Math.abs(ax.ax) + halfH * Math.abs(ax.ay);
        const halfCross = halfW * Math.abs(ax.cx) + halfH * Math.abs(ax.cy);
        const box = reelBoxFor(reelSide);

        const boxAlong = halfAlong * 2 * box.along;
        const boxCross = halfCross * 2 * box.cross;

        const boxH = diagonal ? halfH * 2 * box.cross : (vertical ? boxAlong : boxCross);
        const boxW = diagonal ? halfW * 2 * box.along : (vertical ? boxCross : boxAlong);
        const gapPx = boxAlong * box.gap;
        const spanFull = halfAlong * 2 * REEL_SPAN;
        const crossBase = crossSign * box.inset * halfCross;

        let loop = 0;
        for (let i = 0; i < n; i++) {
            const aspect = reelItems[i].userData.aspect;
            const size = Math.min(boxH, boxW / aspect);
            reelSize[i] = size;
            reelStart[i] = loop;

            const along = box.snug
                ? Math.abs(size * aspect * ax.ax) + Math.abs(size * ax.ay)
                : boxAlong;
            reelSlot[i] = along + gapPx;
            loop += reelSlot[i];
        }

        const AHEAD = 2;
        const dAlong = (AHEAD / 100) * spanFull;

        for (let i = 0; i < n; i++) {
            const mesh = reelItems[i];

            const centre = reelStart[i] + reelSlot[i] * 0.5;
            let d = (centre - reelScroll.pos) % loop;
            if (d < -loop * 0.5) d += loop;
            else if (d >= loop * 0.5) d -= loop;

            const vy = (0.5 - d / spanFull) * 100;
            const dev = (spineX(REEL_SPINE, vy) - 50) / 50 * halfCross;
            const cross = crossBase + dev;

            const home = mesh.userData.home;
            home.x = camera.position.x + d * ax.ax + cross * ax.cx;
            home.y = camera.position.y + d * ax.ay + cross * ax.cy;
            home.z = camera.position.z - REEL_DEPTH;

            mesh.userData.size = reelSize[i];

            const dCross = (spineX(REEL_SPINE, vy + AHEAD) -
                spineX(REEL_SPINE, vy)) / 50 * halfCross;
            mesh.userData.lean = -REEL_TILT * Math.atan2(dCross, dAlong);
        }
    }

    function clearChunks() {
        chunks.forEach(function (meshes) {
            meshes.forEach(releaseMesh);
        });
        chunks.clear();
        for (let i = loadQueue.length - 1; i >= 0; i--) {
            if (loadQueue[i].mesh) loadQueue.splice(i, 1);
        }
    }

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

    function prefetchSources(list) {
        for (let i = 0; i < list.length; i++) {
            const src = list[i].src;
            if (textureCache.has(src) || inflight.has(src)) continue;
            loadQueue.push({ mesh: null, src: src });
        }
        pumpQueue();
    }

    let warmList = null;
    let warmIndex = 0;
    let warmActive = 0;
    const warmed = new Set();

    function warmAll(list) {
        warmList = list.slice();
        warmIndex = 0;
        pumpWarm();
    }

    function pumpWarm() {
        if (!warmList) return;

        if (activeLoads > 0 || loadQueue.length) return;

        while (warmActive < WARM_BATCH && warmIndex < warmList.length) {
            const src = warmList[warmIndex++];
            if (warmed.has(src) || textureCache.has(src)) continue;
            warmed.add(src);
            warmActive++;
            fetch(src)
                .then(function (res) { return res.blob(); })
                .catch(function () { return null; })
                .then(function () {
                    warmActive--;
                    pumpWarm();
                });
        }

        if (warmActive === 0 && warmIndex >= warmList.length) {
            warmList = null;
            if (typeof options.onWarmComplete === "function") {
                options.onWarmComplete(textureCache.size, badSources.size);
            }
        }
    }

    function poolReady(list) {
        if (!list.length) return true;
        let decoded = 0;
        let settled = 0;
        for (let i = 0; i < list.length; i++) {
            if (!textureCache.has(list[i].src)) continue;
            settled++;

            if (textureCache.get(list[i].src)) decoded++;
        }

        if (settled === list.length) return true;
        return decoded / list.length >= SWAP_READY_FRACTION;
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

    const basePos = { x: 0, y: 0, z: INITIAL_CAMERA_Z };
    const velocity = { x: 0, y: 0, z: 0 };
    const targetVel = { x: 0, y: 0, z: 0 };
    let scrollAccum = 0;
    let dragging = false;
    let inputEnabled = false;
    const lastPointer = { x: 0, y: 0 };

    let preloadStarted = false;
    let preloadDone = false;
    let fadeStarted = false;
    let zoomStarted = false;
    let preloadProgressCb = null;
    let preloadCompleteCb = null;
    let introSrcSet = null;
    let introTotal = 0;

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

    const fadeState = { filterFade: 0 };
    const collect = { p: 0, pinch: 1, swirl: 0, blur: 0 };
    const blurPeak = isTouch ? BLUR_MAX * 0.55 : BLUR_MAX;
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

    function meshCollect(phase) {
        const t = (collect.p - phase * COLLECT_STAGGER) / (1 - COLLECT_STAGGER);
        return smoothstep(clamp(t, 0, 1));
    }

    function onPointerDown(e) {
        pressStart.x = e.clientX;
        pressStart.y = e.clientY;
        pressStart.t = performance.now();
        if (!inputEnabled) return;
        dragging = true;
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        container.classList.add("is-dragging");
        if (e.pointerId !== undefined && renderer.domElement.setPointerCapture) {
            try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
        }
    }

    function onPointerMove(e) {
        if (!dragging) return;
        if (reelActive) {

            const dragAxes = reelAxes(reelSide);
            reelScroll.targetVel -=
                ((e.clientX - lastPointer.x) * dragAxes.ax +
                 (lastPointer.y - e.clientY) * dragAxes.ay) * DRAG_SPEED;
        } else {
            targetVel.x -= (e.clientX - lastPointer.x) * DRAG_SPEED;
            targetVel.y += (e.clientY - lastPointer.y) * DRAG_SPEED;
        }
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
    }

    function endDrag(e) {
        dragging = false;
        container.classList.remove("is-dragging");
        if (e.pointerId !== undefined && renderer.domElement.releasePointerCapture) {
            try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        }
    }

    function onPointerUp(e) {
        endDrag(e);
        const moved = Math.abs(e.clientX - pressStart.x) +
            Math.abs(e.clientY - pressStart.y);
        if (moved <= CLICK_SLOP && performance.now() - pressStart.t < CLICK_MS) {
            handleClick(e);
        }
    }

    function onWheel(e) {
        e.preventDefault();
        if (!inputEnabled) return;
        if (reelActive) {
            const delta = reelIsVertical()
                ? -e.deltaY
                : (e.deltaX || 0) + e.deltaY;
            reelScroll.accum += delta * WHEEL_SPEED;
            return;
        }
        scrollAccum += e.deltaY * WHEEL_SPEED;
    }

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", endDrag);
    el.addEventListener("wheel", onWheel, { passive: false });

    function resetPlaneTexture(mesh) {
        mesh.material.map = null;
        mesh.userData.hasTexture = false;
        mesh.userData.requested = false;
    }

    function onContextRestored() {
        textureCache.forEach(function (texture, src) {
            if (texture) {
                textureCache.delete(src);
                textureLastUsed.delete(src);
            }
        });
        loadQueue.length = 0;
        chunks.forEach(function (meshes) { meshes.forEach(resetPlaneTexture); });
        reelItems.forEach(resetPlaneTexture);
    }
    el.addEventListener("webglcontextrestored", onContextRestored);

    function onResize() {

        applyReelSide();
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
    let running = true;
    let framePileScale = 0;
    let frameCollecting = false;

    let lastFrameAt = 0;

    function frame() {
        if (!running) return;
        requestAnimationFrame(frame);

        const nowMs = performance.now();
        const dt = lastFrameAt ? Math.min((nowMs - lastFrameAt) / 1000, 0.05) : 0;
        lastFrameAt = nowMs;

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

        if (driftActive) {
            drift.x += (mouse.x * DRIFT_AMOUNT - drift.x) * DRIFT_LERP;
            drift.y += (mouse.y * DRIFT_AMOUNT - drift.y) * DRIFT_LERP;
        }
        camera.position.set(basePos.x + drift.x, basePos.y + drift.y, basePos.z);
        if (!reelActive) updateChunks();
        reelScroll.targetVel += reelScroll.accum;
        reelScroll.accum *= SCROLL_DECAY;
        reelScroll.targetVel = clamp(reelScroll.targetVel, -MAX_VELOCITY, MAX_VELOCITY);
        reelScroll.vel += (reelScroll.targetVel - reelScroll.vel) * VELOCITY_LERP;

        reelScroll.pos += reelScroll.vel + (reelActive ? reelAutoRate * dt : 0);
        reelScroll.targetVel *= VELOCITY_DECAY;

        const ccx = Math.round(basePos.x / CHUNK_SIZE);
        const ccy = Math.round(basePos.y / CHUNK_SIZE);
        const ccz = Math.round(basePos.z / CHUNK_SIZE);

        const halfH = Math.tan((CAMERA_FOV * 0.5) * Math.PI / 180) * ANCHOR_DEPTH;
        const halfW = halfH * camera.aspect;
        framePileScale = Math.min(halfW, halfH) * PILE_SPREAD;
        anchorWorld.x = camera.position.x + anchorNdc.x * halfW * ANCHOR_INSET;
        anchorWorld.y = camera.position.y + anchorNdc.y * halfH * ANCHOR_INSET;
        anchorWorld.z = camera.position.z - ANCHOR_DEPTH;

        frameCollecting = collect.p > 0;
        const fHalfH = Math.tan((CAMERA_FOV * 0.5) * Math.PI / 180) * FOCUS_DEPTH;
        focusTarget.x = camera.position.x;
        focusTarget.y = camera.position.y;
        focusTarget.z = camera.position.z - FOCUS_DEPTH;
        focusMaxH = fHalfH * 2 * FOCUS_FILL_H;
        focusMaxW = fHalfH * camera.aspect * 2 * FOCUS_FILL_W;

        if (reelActive) {
            layoutReel(halfW, halfH);
            for (let i = 0; i < reelItems.length; i++) updatePlane(reelItems[i], 1);
        } else {
            chunks.forEach(function (meshes, key) {
                const p = key.split(",");
                const gridDist = Math.max(
                    Math.abs(parseInt(p[0], 10) - ccx) / RENDER_X,
                    Math.abs(parseInt(p[1], 10) - ccy) / RENDER_Y,
                    Math.abs(parseInt(p[2], 10) - ccz) / RENDER_Z
                );
                const gridFade = clamp(1 - (gridDist - 0.5) / 0.5, 0, 1);
                for (let m = 0; m < meshes.length; m++) updatePlane(meshes[m], gridFade);
            });
        }

        applyBlur(collect.blur);
        updateFocusIndicator();
        renderer.render(scene, camera);
    }

    function updatePlane(mesh, gridFade) {
        const home = mesh.userData.home;

        const forward = basePos.z - home.z;
        const absDepth = Math.abs(home.z - basePos.z);

        let depthFade;
        if (forward < 0 || absDepth > DEPTH_FADE_END || absDepth < NEAR_FADE_CUT) {

            depthFade = 0;
        } else if (absDepth < NEAR_FADE_FULL) {

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

        if (target > REQUEST_THRESHOLD && !mesh.userData.requested) {
            requestTexture(mesh, mesh.userData.src);
        }

        const ct = frameCollecting ? meshCollect(mesh.userData.phase) : 0;
        const shrink = 1 - ct * (1 - COLLECT_SCALE);
        const pile = mesh.userData.pile;

        let pileX = pile.x;
        let pileY = pile.y;
        if (collect.swirl !== 0) {
            const a = collect.swirl * (CHURN_CORE - pile.r);
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            pileX = pile.x * cos - pile.y * sin;
            pileY = pile.x * sin + pile.y * cos;
        }

        let rot = collect.swirl * pile.spin * ct + mesh.userData.lean * (1 - ct);
        let px = home.x + (anchorWorld.x + pileX * framePileScale - home.x) * ct;
        let py = home.y + (anchorWorld.y + pileY * framePileScale - home.y) * ct;
        let pz = home.z + (anchorWorld.z + pile.z - home.z) * ct;
        let sh = mesh.userData.size * shrink;

        if (focus.amount > 0 && mesh === focusMesh) {
            const f = focus.amount;
            const fh = Math.min(focusMaxH, focusMaxW / mesh.userData.aspect);
            px += (focusTarget.x - px) * f;
            py += (focusTarget.y - py) * f;
            pz += (focusTarget.z - pz) * f;
            sh += (fh - sh) * f;

            rot *= 1 - f;
        }

        mesh.rotation.z = rot;
        mesh.position.set(px, py, pz);
        mesh.scale.set(sh * mesh.userData.aspect, sh, 1);

        updateMask(mesh, mesh === focusMesh ? focus.amount : 0);

        const reveal = mesh.userData.hasTexture ? target : 0;
        mesh.userData.opacity += (reveal - mesh.userData.opacity) * 0.18;

        let alpha = mesh.userData.opacity * collect.pinch;

        if (focus.amount > 0) {

            alpha = mesh === focusMesh
                ? alpha + (1 - alpha) * focus.amount
                : alpha * (1 - focus.amount);
        }

        mesh.material.opacity = alpha;
        mesh.visible = alpha > INVIS_THRESHOLD;
    }

    loadButterflyMasks().then(function (list) {
        if (!list.length || !running) return;
        masks = list;
        chunks.forEach(function (meshes) { meshes.forEach(applyMask); });
        for (let i = 0; i < reelItems.length; i++) applyMask(reelItems[i]);
    });

    frame();

    return {

        setFilter: function (nextImages, opts) {

            incomingPool = nextImages.slice();
            prefetchSources(nextImages);

            const o = opts || {};
            const anchor = o.anchor;
            const wantsReel = o.layout === "reel";

            cancelFocus();
            selectEnabled = Boolean(o.selectable);

            reelAutoRate = 0;

            const tl = window.gsap.timeline();
            let swapped = false;

            tl.set(anchorNdc, {
                x: anchor ? anchor[0] : 0,
                y: anchor ? anchor[1] : 0
            });
            tl.set(collect, { pinch: 1, swirl: 0, blur: 0 });

            tl.fromTo(collect, { p: 0 },
                { p: 1, duration: COLLECT_IN, ease: "power2.inOut" });

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

            tl.call(function () {

                if (swapped) return;
                swapped = true;

                activePool = nextImages.slice();
                incomingPool = [];

                layoutSalt = (layoutSalt + 1) >>> 0;

                clearChunks();
                clearReel();

                trimTextureCache();
                reelActive = wantsReel;
                if (wantsReel) {
                    reelSideWanted = o.side || "right";
                    applyReelSide();
                    buildReel();

                    targetVel.x = targetVel.y = targetVel.z = 0;
                    velocity.x = velocity.y = velocity.z = 0;
                    scrollAccum = 0;
                } else {
                    updateChunks();
                }

                if (poolReady(activePool)) return;
                tl.pause();
                whenPoolReady(activePool, function () { tl.play(); });
            }, null, "mix+=" + CHURN_IN);

            tl.to(collect, {
                blur: 0,
                pinch: 1,
                duration: CHURN_OUT,
                ease: "power2.out"
            }, "mix+=" + CHURN_IN);

            const spreadAt = "mix+=" + (CHURN_IN + CHURN_OUT + PILE_HOLD_OUT);

            tl.call(function () {
                if (typeof o.onSpread === "function") o.onSpread();
            }, null, spreadAt);

            tl.to(collect, { p: 0, duration: COLLECT_OUT, ease: "power2.inOut" },
                spreadAt);
            return tl;
        },

        setArrangement: function (side, onForm) {
            const g = window.gsap;
            const tl = g.timeline();
            const toReel = Boolean(side);

            cancelFocus();

            selectEnabled = !toReel;

            tl.set(collect, { p: 0, swirl: 0, blur: 0 });
            tl.to(collect, { pinch: 0, duration: ARRANGE_OUT, ease: "power2.in" });

            tl.call(function () {
                clearChunks();
                clearReel();
                layoutSalt = (layoutSalt + 1) >>> 0;
                reelActive = toReel;

                if (toReel) {
                    reelSideWanted = side;
                    applyReelSide();
                    buildReel();
                    targetVel.x = targetVel.y = targetVel.z = 0;
                    velocity.x = velocity.y = velocity.z = 0;
                    scrollAccum = 0;

                    reelScroll.pos = ARRANGE_SLIDE;
                } else {
                    updateChunks();
                }
            });

            tl.addLabel("form");

            tl.call(function () {
                if (typeof onForm === "function") onForm();
            }, null, "form");
            tl.to(collect, { pinch: 1, duration: ARRANGE_IN, ease: "power2.out" }, "form");
            if (toReel) {
                tl.to(reelScroll, { pos: 0, duration: ARRANGE_IN, ease: "power3.out" }, "form");
            }

            tl.call(function () { reelAutoRate = toReel ? REEL_AUTO_RATE : 0; });
            return tl;
        },

        prefetch: function (list) {
            prefetchSources(list);
        },

        warmAll: function (list) {
            warmAll(list);
        },

        preload: function (onProgress, onComplete) {
            preload(onProgress, onComplete);
        },

        fadeIn: function () {
            if (fadeStarted) return;
            fadeStarted = true;
            window.gsap.to(fadeState, {
                filterFade: 1,
                duration: REVEAL_FADE,
                ease: "power2.out"
            });
        },

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

        armFirstMove: function () {
            firstMoveArmed = true;
        },

        destroy: function () {
            running = false;
            applyBlur(0);
            cancelFocus();
            if (options.focusIndicator) {
                options.focusIndicator.classList.remove("is-visible");
            }
            window.removeEventListener("resize", onResize);
            window.removeEventListener("mousemove", onMouseMove);
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", endDrag);
            el.removeEventListener("pointerleave", endDrag);
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("webglcontextrestored", onContextRestored);
            clearChunks();
            clearReel();
            textureCache.forEach(function (t) { if (t) t.dispose(); });
            textureCache.clear();
            textureLastUsed.clear();
            masks.forEach(function (m) { m.texture.dispose(); });
            masks = [];
            geometry.dispose();
            pool.forEach(function (m) { m.material.dispose(); });
            renderer.dispose();
            if (el.parentNode) el.parentNode.removeChild(el);
        }
    };
}
