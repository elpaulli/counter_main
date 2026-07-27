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

/* ---------- reel layout ----------
   A filter marked layout:"reel" doesn't scatter back into the 3D field. Its
   images instead fly out of the gathered cluster into one endless vertical
   strip down the right of the frame: a single large image centred, the bottom
   of the previous one showing above it and the top of the next below, scrolling
   under the wheel. The strip rides a gently curved spine, so the column drifts
   sideways as it travels rather than running dead straight.

   The reel is its own small set of planes — one per image in the pool, in pool
   order — rather than part of the chunk field, because "endless" here means a
   finite list looping, not procedurally generated space. */

/* The spine, as an SVG path in a 100x100 viewBox. y 0..100 runs the length of
   the strip (SVG's y-down convention, so it can be authored in a vector tool
   and pasted in); x is the strip's *deviation from its own centreline*, where
   50 is dead straight. Only M and C commands are read.

   Deviation rather than absolute position is what lets one path serve all four
   strips: the per-axis `inset` below decides which edge it sits on, and this
   only says how the strip wanders as it travels. Keep it monotonic in y — the
   reel reads deviation off it as a function of distance along the strip. */
const REEL_PATH = "M 46 0 C 56 28, 56 72, 46 100";


/* How many points the spine is sampled into. It's a fixed table built once at
   load, not per frame. */
const REEL_SPINE_SAMPLES = 256;

/* How tall the strip is, in viewport heights. Only the middle ~1 of that is on
   screen; the rest is the run-up either side, so images are placed and dropped
   well outside the frame and never pop into view. */
const REEL_SPAN = 2.8;

/* Per axis: the box each image is fitted inside (fractions of the viewport
   measured along the strip and across it), and how far the strip's centreline
   sits from the middle of the frame (fraction of the half extent across it).

   Two sets because the axes aren't interchangeable — a vertical strip on a wide
   screen has height to spend and width to spare, a horizontal one the reverse —
   and because `cross` and `inset` together decide how far the images reach back
   toward the middle. That matters: the copy panel occupies the opposite half,
   and a wide box on a small inset puts the two on top of each other.

   `gap` is the space between slots as a fraction of the along box — what lets
   the neighbours' edges show, telling you the strip continues.

   `snug` decides how slots are sized. Off, every slot is a full along-box wide,
   which is right when the images are all roughly one shape. On, each image gets
   a slot as wide as it actually renders — which this library needs on the
   horizontal strips, being 61% portrait and 37% landscape: a fixed slot sized
   for one shape leaves a hole around the other, and the hole was the whole
   complaint. The vertical strips stay un-snug, unchanged. */
const REEL_BOX_VERTICAL = {
    along: 0.62, cross: 0.40, inset: 0.46, gap: 0.19, snug: false
};
const REEL_BOX_HORIZONTAL = {
    along: 0.30, cross: 0.46, inset: 0.38, gap: 0.06, snug: true
};

/* Depth the strip sits at. Inside the solid band (NEAR_FADE_FULL ..
   DEPTH_FADE_START) so the depth fade leaves it alone. */
const REEL_DEPTH = 65;

/* How much of the spine's tangent the images take on as tilt. 0 keeps every
   image upright; 1 would rotate them fully onto the curve. A little sells the
   path, a lot looks like a mistake. */
const REEL_TILT = 0.4;

/* Scroll feel is deliberately NOT its own model: the strip runs on the same
   accumulator -> velocity -> decay the camera fly-through uses, with the same
   constants (WHEEL_SPEED, DRAG_SPEED, MAX_VELOCITY, VELOCITY_LERP,
   VELOCITY_DECAY, SCROLL_DECAY). Both move in world units, so they transfer
   directly, and a flick of the wheel builds speed and coasts through the images
   exactly as it does in the 3D field. Easing toward a target position instead
   loses that — it decelerates into a stop rather than carrying. */

/* ---------- focus (clicking a photo on the unfiltered canvas) ----------
   Click a plane and it is selected — a plus appears over it. Click that same
   plane again and it flies to the middle of the frame at as much of the screen
   height as it can fill, while the rest of the world, chrome included, fades to
   nothing. A click anywhere then puts it back where it was.

   Unfiltered canvas only: a filter's layout is a composition of its own, and
   lifting one image out of a reel or a themed scatter says nothing. */
const FOCUS_IN = 0.75;
const FOCUS_OUT = 0.55;

/* Where the focused image sits, and how much of the frame it fills. Height is
   the target; the width cap only stops a panorama running off the sides. */
const FOCUS_DEPTH = 60;
const FOCUS_FILL_H = 0.92;
const FOCUS_FILL_W = 0.94;

/* A press counts as a click, rather than the end of a drag, only if the pointer
   barely moved and it was over quickly. */
const CLICK_SLOP = 6;
const CLICK_MS = 450;

/* Don't let a click land on a plane that is barely on screen. */
const PICK_MIN_OPACITY = 0.3;

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

/* ---------- reel spine ---------- */
/* Read an SVG path of one M followed by cubic C segments into a flat list of
   Bezier segments. Deliberately minimal — this parses the shape of path we
   author for the reel, not SVG in general; anything else throws it out and the
   reel falls back to a straight column. */
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
            /* Any coordinate pairs following an M are implicit line commands;
               the reel path doesn't use them, so stop rather than guess. */
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

/* Sample the path into a table the reel can query by height.

   The reel places images at even *vertical* intervals and looks up how far the
   spine has wandered sideways at that height — so the strip's framing (one
   image centred, its neighbours peeking in) stays exact no matter how the path
   curves. That makes the useful form of the path x as a function of y, which is
   why this samples into a y-ascending table rather than by arc length. */
function buildSpine(d, samples) {
    const segs = parsePath(d);
    const xs = new Float64Array(samples + 1);
    const ys = new Float64Array(samples + 1);
    if (!segs) {
        /* Straight column at frame centre — the reel still works, it just
           doesn't curve. */
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

/* Lateral position of the spine at height `y` (viewBox units, 0..100), by
   binary search over the y-ascending table. Clamped at both ends so heights off
   either end of the path just hold the end's offset. */
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
        /* The pool recycles planes as chunks are culled. If the selected one is
           going back, the selection has to go with it — otherwise the plus
           tracks a plane that has become some other image. */
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
            mesh.userData.lean = 0;
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

    /* ---------- reel ----------
       One plane per pool image, in pool order, living outside the chunk field.
       Positions are recomputed every frame from the scroll offset, so `home` is
       dynamic here where a chunk plane's is fixed — everything downstream
       (gather, depth fade, load priority) reads `home` and so needs no special
       case for the reel at all. */
    let reelActive = false;
    /* Which edge the strip runs along: "left"/"right" scroll vertically,
       "top"/"bottom" horizontally. */
    let reelSide = "right";
    const reelItems = [];
    /* Slot table, sized with the reel and rewritten each frame by layoutReel:
       where each image starts along the strip, how wide its slot is, and the
       height it renders at. */
    let reelStart = null;
    let reelSlot = null;
    let reelSize = null;
    /* Position along the strip, in world units, and the momentum driving it —
       the same four-part model as the camera: wheel impulses land in `accum`,
       bleed into `targetVel`, which `vel` chases and which decays on its own. */
    const reelScroll = { pos: 0, vel: 0, targetVel: 0, accum: 0 };

    function buildReel() {
        clearReel();
        if (!activePool.length) return;

        const rng = mulberry32(hashCoords(0, 0, 0, layoutSalt));
        for (let i = 0; i < activePool.length; i++) {
            const pileAngle = rng() * Math.PI * 2;
            const pileRadius = Math.sqrt(rng());

            const mesh = acquireMesh();
            /* Placeholder until layoutReel runs — it is overwritten every frame
               before anything reads it. */
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
            mesh.material.opacity = 0;
            mesh.material.map = null;
            mesh.visible = false;

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

    function reelIsVertical() {
        return reelSide === "left" || reelSide === "right";
    }

    /* ---------- focus ----------
       `focusMesh` is the selected plane (the one wearing the plus);
       `focusZoomed` says it has been opened; `focus.amount` is the 0..1 GSAP
       drives, which updatePlane blends position, scale and opacity against. */
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

        /* Only planes actually readable on screen are candidates — the field is
           full of near-transparent ones at its edges and in its depth, and
           picking one of those would feel like clicking nothing. */
        pickList.length = 0;
        chunks.forEach(function (meshes) {
            for (let i = 0; i < meshes.length; i++) {
                const m = meshes[i];
                if (m.visible && m.material.opacity >= PICK_MIN_OPACITY) pickList.push(m);
            }
        });

        const hits = raycaster.intersectObjects(pickList, false);
        return hits.length ? hits[0].object : null;
    }

    function handleClick(e) {
        /* Open: a click anywhere closes it. */
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
        /* Pan and fly-through are off while an image is open — the click that
           closes it must not also throw the camera. */
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

    /* Hard reset, no animation: a filter has taken over, or the selected plane
       is being recycled out from under us. */
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

    /* Park the plus over the selected plane, in screen space. */
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

    /* Lay the strip out for this frame: each image gets an even slot along the
       strip, wrapped around the loop, offset across it by the spine's deviation
       at that point.

       Written in along/across terms rather than x/y so one pass serves all four
       strips; `vertical` and `crossSign` are the only things that differ, and
       they only bite at the two points where along/across become world axes.

       Every item is placed, including the ones nowhere near the frame — they
       simply land far along the strip and the renderer frustum-culls them.
       Placing only the visible few would be cheaper, but the pool is also what
       the gather collects into the corner: cull it here and the cluster would
       shrink from a full pile to a handful of images at the swap.

       Wrapping is seamless as long as half the loop clears the screen, i.e.
       roughly three images or more in the pool. */
    function layoutReel(halfW, halfH) {
        const n = reelItems.length;
        if (!n) return;

        const vertical = reelSide === "left" || reelSide === "right";
        /* Which way along the cross axis the strip is pushed. Screen y is up in
           world space, so "top" is positive and "bottom" negative. */
        const crossSign = (reelSide === "right" || reelSide === "top") ? 1 : -1;

        const halfAlong = vertical ? halfH : halfW;
        const halfCross = vertical ? halfW : halfH;
        const box = vertical ? REEL_BOX_VERTICAL : REEL_BOX_HORIZONTAL;

        const boxAlong = halfAlong * 2 * box.along;
        const boxCross = halfCross * 2 * box.cross;
        const boxH = vertical ? boxAlong : boxCross;
        const boxW = vertical ? boxCross : boxAlong;
        const gapPx = boxAlong * box.gap;
        const spanFull = halfAlong * 2 * REEL_SPAN;
        const crossBase = crossSign * box.inset * halfCross;

        /* Slot table. Each image is fitted to the box first, then given a slot
           that either matches what it actually renders (snug) or a full box
           (not). Recomputed every frame rather than cached against the aspects:
           n is capped at the pool size, so a running total is cheaper than
           working out whether a texture has landed since last time. */
        let loop = 0;
        for (let i = 0; i < n; i++) {
            const aspect = reelItems[i].userData.aspect;
            const size = Math.min(boxH, boxW / aspect);
            reelSize[i] = size;
            reelStart[i] = loop;
            const along = box.snug ? (vertical ? size : size * aspect) : boxAlong;
            reelSlot[i] = along + gapPx;
            loop += reelSlot[i];
        }

        /* How far ahead along the spine to sample for the tangent, in viewBox y. */
        const AHEAD = 2;
        const dAlong = (AHEAD / 100) * spanFull;

        for (let i = 0; i < n; i++) {
            const mesh = reelItems[i];

            /* Signed distance from the centre of the frame along the strip,
               wrapped into [-loop/2, loop/2) so it runs endlessly both ways. */
            const centre = reelStart[i] + reelSlot[i] * 0.5;
            let d = (centre - reelScroll.pos) % loop;
            if (d < -loop * 0.5) d += loop;
            else if (d >= loop * 0.5) d -= loop;

            /* Distance along the spine as viewBox y (0 at the start of the
               strip, 100 at the end — SVG's direction, hence the negated d).
               Items past either end read the clamped end deviation, which keeps
               the strip straight where it has run off the path. */
            const vy = (0.5 - d / spanFull) * 100;
            const dev = (spineX(REEL_SPINE, vy) - 50) / 50 * halfCross;
            const cross = crossBase + dev;

            const home = mesh.userData.home;
            home.x = camera.position.x + (vertical ? cross : d);
            home.y = camera.position.y + (vertical ? d : cross);
            home.z = camera.position.z - REEL_DEPTH;

            /* Fitted to the box above, where the slot width was worked out from
               the same number. */
            mesh.userData.size = reelSize[i];

            /* Lean into the spine's slope, so the strip visibly rides the curve
               rather than sliding along it. With the tangent as (dCross across,
               dAlong along), the plane turns by -atan(dCross/dAlong) — the same
               expression on either axis, since both are written in the strip's
               own frame. Taken at a fraction of the true angle: the full tangent
               looks like a mistake, a hint of it reads. */
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
        /* Recorded even when input is off, because an open image still has to
           be closable by clicking. */
        pressStart.x = e.clientX;
        pressStart.y = e.clientY;
        pressStart.t = performance.now();
        if (!inputEnabled) return;
        dragging = true;
        lastPointer.x = e.clientX;
        lastPointer.y = e.clientY;
        container.classList.add("is-dragging");
        /* Guarded like its release counterpart: capturing a pointer that isn't
           active throws, and a failed capture only costs us drags that run off
           the canvas — not worth taking the handler down for. */
        if (e.pointerId !== undefined && renderer.domElement.setPointerCapture) {
            try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
        }
    }

    function onPointerMove(e) {
        if (!dragging) return;
        if (reelActive) {
            /* The reel owns the gesture: dragging throws the strip instead of
               panning a field that isn't there. The images follow the pointer,
               so the sign flips with the axis — screen y runs opposite world y,
               screen x runs with world x. */
            reelScroll.targetVel += reelIsVertical()
                ? (e.clientY - lastPointer.y) * DRAG_SPEED
                : -(e.clientX - lastPointer.x) * DRAG_SPEED;
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

    /* Only a real pointerup can be a click — leaving the canvas or having the
       gesture cancelled ends the drag but selects nothing. */
    function onPointerUp(e) {
        endDrag(e);
        const moved = Math.abs(e.clientX - pressStart.x) +
            Math.abs(e.clientY - pressStart.y);
        if (moved <= CLICK_SLOP && performance.now() - pressStart.t < CLICK_MS) {
            handleClick(e);
        }
    }

    /* Wheel feeds a scroll accumulator that bleeds into Z velocity, so a flick
       of the wheel carries you forward and coasts to a stop. In reel mode it
       drives the strip instead — there's nothing to fly through. */
    function onWheel(e) {
        e.preventDefault();
        if (!inputEnabled) return;
        if (reelActive) {
            /* Same impulse the fly-through gets, aimed at the strip. A vertical
               strip is negated so scrolling down carries the images up; a
               horizontal one advances left, which is what scrolling down means
               on a sideways strip. Horizontal wheels / trackpad swipes feed the
               same axis, so either gesture drives it. */
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

    /* Set once per frame, read by updatePlane — closure-level rather than
       arguments so the shared per-plane path stays a plain two-arg call. */
    let framePileScale = 0;
    let frameCollecting = false;

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

        /* The reel replaces the chunk field rather than sitting on top of it —
           building chunks here would repopulate the scatter behind the strip. */
        if (!reelActive) updateChunks();

        /* Strip momentum, stepped exactly like the camera's above. */
        reelScroll.targetVel += reelScroll.accum;
        reelScroll.accum *= SCROLL_DECAY;
        reelScroll.targetVel = clamp(reelScroll.targetVel, -MAX_VELOCITY, MAX_VELOCITY);
        reelScroll.vel += (reelScroll.targetVel - reelScroll.vel) * VELOCITY_LERP;
        reelScroll.pos += reelScroll.vel;
        reelScroll.targetVel *= VELOCITY_DECAY;

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
        framePileScale = Math.min(halfW, halfH) * PILE_SPREAD;
        anchorWorld.x = camera.position.x + anchorNdc.x * halfW * ANCHOR_INSET;
        anchorWorld.y = camera.position.y + anchorNdc.y * halfH * ANCHOR_INSET;
        anchorWorld.z = camera.position.z - ANCHOR_DEPTH;

        frameCollecting = collect.p > 0;

        /* Where an opened image goes: dead centre, as tall as it can be without
           running off the sides. */
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

    /* One plane, one frame. Shared by the chunk field and the reel: the only
       thing that differs between them is where `home` comes from, and both have
       already written it by the time this runs. */
    function updatePlane(mesh, gridFade) {
        const home = mesh.userData.home;
        /* Camera looks down -Z, so a plane is in front when its z is less than
           the camera's. Planes behind get no opacity and no texture — they've
           been flown past and aren't drawable anyway, so this keeps the load
           budget on what's ahead.
           Depth is measured from home, not the rendered position: a plane
           collapsing toward the anchor must keep the visibility it had where it
           lives, or it would blink out mid-flight. */
        const forward = basePos.z - home.z;
        const absDepth = Math.abs(home.z - basePos.z);

        let depthFade;
        if (forward < 0 || absDepth > DEPTH_FADE_END || absDepth < NEAR_FADE_CUT) {
            /* behind the camera, past the far fade, or so close it would fill
               the screen — draw nothing */
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

        /* Only pull a texture once the plane is prominent enough to be worth a
           download — see REQUEST_THRESHOLD. */
        if (target > REQUEST_THRESHOLD && !mesh.userData.requested) {
            requestTexture(mesh, mesh.userData.src);
        }

        /* Gather: slide the plane from home to its own spot in the cluster and
           shrink it, holding full opacity the whole way — the images gather,
           they don't dissolve. */
        const ct = frameCollecting ? meshCollect(mesh.userData.phase) : 0;
        const shrink = 1 - ct * (1 - COLLECT_SCALE);
        const pile = mesh.userData.pile;

        /* Mix: turn the tile's place in the cluster around the anchor, further
           at the centre than at the rim, and tumble it on its own axis as it
           goes. */
        let pileX = pile.x;
        let pileY = pile.y;
        if (collect.swirl !== 0) {
            const a = collect.swirl * (CHURN_CORE - pile.r);
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            pileX = pile.x * cos - pile.y * sin;
            pileY = pile.x * sin + pile.y * cos;
        }
        /* Two rotations, each owned by one end of the move: the cluster's tumble
           scaled by ct so it unwinds to nothing as the plane flies back out
           (otherwise the swirl's final value leaves the settled field at a
           tilt), and the reel's lean into its spine scaled by the inverse, so a
           strip image is upright-on-the-curve at rest and surrenders that as it
           gathers. Chunk planes carry lean 0 and only ever see the first. */
        let rot = collect.swirl * pile.spin * ct + mesh.userData.lean * (1 - ct);
        let px = home.x + (anchorWorld.x + pileX * framePileScale - home.x) * ct;
        let py = home.y + (anchorWorld.y + pileY * framePileScale - home.y) * ct;
        let pz = home.z + (anchorWorld.z + pile.z - home.z) * ct;
        let sh = mesh.userData.size * shrink;

        /* Focus rides on top of all of the above, and only ever on one plane.
           It blends from wherever the plane already is, so opening and closing
           read as the same image travelling rather than a new one appearing. */
        if (focus.amount > 0 && mesh === focusMesh) {
            const f = focus.amount;
            const fh = Math.min(focusMaxH, focusMaxW / mesh.userData.aspect);
            px += (focusTarget.x - px) * f;
            py += (focusTarget.y - py) * f;
            pz += (focusTarget.z - pz) * f;
            sh += (fh - sh) * f;
            /* Square up as it opens — a tilted hero image looks like an error. */
            rot *= 1 - f;
        }

        mesh.rotation.z = rot;
        mesh.position.set(px, py, pz);
        mesh.scale.set(sh * mesh.userData.aspect, sh, 1);

        const reveal = mesh.userData.hasTexture ? target : 0;
        mesh.userData.opacity += (reveal - mesh.userData.opacity) * 0.18;
        /* The pinch is applied after the smoothing lerp, never through it: the
           lerp is there to ease chunk and depth fades, and running the swap dip
           through it would leave planes still faintly visible at the moment the
           pool changes underneath. */
        let alpha = mesh.userData.opacity * collect.pinch;

        if (focus.amount > 0) {
            /* The opened plane goes fully solid whatever its depth fade said —
               it is no longer part of the field — and takes the rest with it. */
            alpha = mesh === focusMesh
                ? alpha + (1 - alpha) * focus.amount
                : alpha * (1 - focus.amount);
        }

        mesh.material.opacity = alpha;
        mesh.visible = alpha > INVIS_THRESHOLD;
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
        setFilter: function (nextImages, opts) {
            /* Start the download now, while the outgoing images still have the
               whole gather and hold to play out — that head start is most of
               what the spread needs to come back full. */
            prefetchSources(nextImages);

            const o = opts || {};
            const anchor = o.anchor;
            const wantsReel = o.layout === "reel";

            /* Selection belongs to the unfiltered canvas only, so drop whatever
               is selected or open and let the caller say whether the view being
               switched to gets it back. */
            cancelFocus();
            selectEnabled = Boolean(o.selectable);

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

                /* Whichever layout is going, tear the other one down first —
                   the two never coexist. Both leave their planes at the pile
                   (ct is 1 here), so the spread that follows carries the new
                   set out of the cluster either way; the only difference is
                   where "out" is. */
                clearChunks();
                clearReel();
                reelActive = wantsReel;
                if (wantsReel) {
                    reelSide = o.side || "right";
                    buildReel();
                    /* Nothing left to fly through, and a leftover fling would
                       drag the strip's frame with it. */
                    targetVel.x = targetVel.y = targetVel.z = 0;
                    velocity.x = velocity.y = velocity.z = 0;
                    scrollAccum = 0;
                } else {
                    updateChunks();
                }

                /* The new layout exists as of here, so anything outside the
                   canvas that belongs to it — the filter's copy panel — can
                   start arriving. Fired ahead of the readiness wait below on
                   purpose: that gives the copy the rest of the mix and the whole
                   spread to fade up, instead of landing after the images have. */
                if (typeof o.onSwap === "function") o.onSwap();

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
            clearChunks();
            clearReel();
            textureCache.forEach(function (t) { if (t) t.dispose(); });
            textureCache.clear();
            geometry.dispose();
            pool.forEach(function (m) { m.material.dispose(); });
            renderer.dispose();
            if (el.parentNode) el.parentNode.removeChild(el);
        }
    };
}
