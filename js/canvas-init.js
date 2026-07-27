/* ============================================
   COUNTER- CLT — INFINITE CANVAS BOOTSTRAP
   ============================================
   Loads the image manifest, starts the canvas, and wires the centred Menu
   control to it. Kept separate from main.js because this half is an ES module
   (Three.js ships as ESM) while main.js stays a classic script.
   ============================================ */

import { createInfiniteCanvas } from "./infinite-canvas.js";

const MANIFEST_URL = "js/canvas-manifest.json";
const BASE_LABEL = "Menu";

/* Backstop: if the pool never finishes loading (stalled network, missing file),
   report the load complete anyway after this long so the black loading screen
   can't hang — the reveal proceeds with whatever made it in. */
const INTRO_SAFETY_MS = 14000;

/* Ceiling on how many distinct images any one view draws from. The canvas fills
   hundreds of planes by repeating this pool, so the cap costs nothing visually
   while keeping the intro download (and every filter switch after it) to a fixed
   budget instead of scaling with the library. */
const POOL_LIMIT = 60;

/* Where each menu item's images gather during a switch, in normalised screen
   coords: x -1 = left / +1 = right, y -1 = bottom / +1 = top. Used only if the
   manifest doesn't carry its own `anchor` — regenerate it with
   tools/generate-manifest.py to change these. */
const DEFAULT_ANCHORS = {
    experience: [-1, -1],   /* bottom left  */
    design:     [ 1, -1],   /* bottom right */
    details:    [ 1,  1],   /* top right    */
    menus:      [-1,  1],   /* top left     */
    beverages:  [ 0,  1],   /* middle top   */
    team:       [ 0,  0]    /* centre       */
};

/* Hover only counts as intent after this long, so sweeping the pointer down the
   option list doesn't kick off a download for every filter at once. */
const PREFETCH_DWELL_MS = 140;

function imagesForFilter(manifest, filterId) {
    return manifest.images.filter(function (img) {
        return img.filters.indexOf(filterId) !== -1;
    });
}

function anchorForFilter(manifest, filterId) {
    const filter = manifest.filters.find(function (f) { return f.id === filterId; });
    if (filter && Array.isArray(filter.anchor) && filter.anchor.length === 2) {
        return filter.anchor;
    }
    return DEFAULT_ANCHORS[filterId] || [0, 0];
}

/* Fisher-Yates, in place */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

/* At most POOL_LIMIT images, dealt round-robin from the folders `entries`
   spans. Round-robin rather than a flat random sample so every folder is
   represented no matter how lopsided the folder sizes are — a flat sample of 60
   from 187 would under-serve beverages (17 files) and could miss it outright.
   Re-shuffled on every call, so each visit — and each return to the same filter
   — draws a different set. */
function samplePool(entries, limit) {
    if (entries.length <= limit) return shuffle(entries.slice());

    const byFolder = new Map();
    entries.forEach(function (img) {
        if (!byFolder.has(img.folder)) byFolder.set(img.folder, []);
        byFolder.get(img.folder).push(img);
    });

    /* Shuffle within each folder, then shuffle the folder order too, so the
       remainder (when the limit doesn't divide evenly) doesn't always land on
       the same folders. */
    const buckets = shuffle(Array.from(byFolder.values()).map(shuffle));

    const out = [];
    let depth = 0;
    let took = true;
    while (out.length < limit && took) {
        took = false;
        for (let b = 0; b < buckets.length && out.length < limit; b++) {
            if (depth < buckets[b].length) {
                out.push(buckets[b][depth]);
                took = true;
            }
        }
        depth++;
    }
    return shuffle(out);
}

/* Builds the collapse/expand Menu: collapsed it shows "Menu" (or
   "Menu — the Experience" once something is chosen); clicking expands the
   option list; choosing one fades the canvas, updates the label, and
   collapses. `onSelect` returns the GSAP timeline so we can lock out further
   clicks until the fade finishes. `onHover` gets a head start on the images for
   an option the pointer is resting on, so a switch has something to show. */
function buildMenu(manifest, onSelect, onHover) {
    const menu = document.getElementById("canvas-menu");
    const toggle = document.getElementById("canvas-menu-toggle");
    const label = document.getElementById("canvas-menu-label");
    const optionsWrap = document.getElementById("canvas-menu-options");
    if (!menu || !toggle || !label || !optionsWrap) return;

    const buttons = manifest.filters.map(function (filter) {
        const btn = document.createElement("button");
        btn.className = "canvas-menu-option";
        btn.type = "button";
        btn.textContent = filter.label;
        btn.dataset.filter = filter.id;
        btn.setAttribute("aria-pressed", "false");
        optionsWrap.appendChild(btn);
        return btn;
    });

    let open = false;
    let busy = false;
    let current = null;

    function setOpen(next) {
        open = next;
        menu.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
    }

    toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        if (busy) return;
        setOpen(!open);
    });

    optionsWrap.addEventListener("click", function (e) {
        const btn = e.target.closest(".canvas-menu-option");
        if (!btn || busy) return;

        if (btn.dataset.filter !== current) {
            current = btn.dataset.filter;
            label.textContent = BASE_LABEL + " — " + btn.textContent;
            buttons.forEach(function (b) {
                const active = b === btn;
                b.classList.toggle("is-active", active);
                b.setAttribute("aria-pressed", String(active));
            });

            busy = true;
            const done = onSelect(current);
            if (done && done.eventCallback) {
                done.eventCallback("onComplete", function () { busy = false; });
            } else {
                busy = false;
            }
        }
        setOpen(false);
    });

    /* Click anywhere else, or press Escape, to collapse */
    document.addEventListener("click", function (e) {
        if (open && !menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) setOpen(false);
    });

    /* Dwell on an option (pointer or keyboard focus) and its images start
       downloading, so by the time it's clicked the collect has less to wait on. */
    if (typeof onHover === "function") {
        let dwell = null;
        buttons.forEach(function (btn) {
            function arm() {
                if (btn.dataset.filter === current) return;
                clearTimeout(dwell);
                dwell = setTimeout(function () { onHover(btn.dataset.filter); },
                    PREFETCH_DWELL_MS);
            }
            btn.addEventListener("mouseenter", arm);
            btn.addEventListener("focus", arm);
            btn.addEventListener("mouseleave", function () { clearTimeout(dwell); });
        });
    }
}

async function boot() {
    const container = document.getElementById("infinite-canvas");
    if (!container) return;

    let manifest;
    try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error("HTTP " + res.status);
        manifest = await res.json();
    } catch (err) {
        console.warn(
            "Infinite canvas: could not load " + MANIFEST_URL + ". " +
            "Serve the site over http:// and run tools/generate-manifest.py.",
            err
        );
        return;
    }

    /* The label stays "Menu" until a filter is chosen, so the opening view is
       the whole library — every folder — not one filter's slice. Capped and
       re-drawn per visit, so the opening field is a different 60 every time. */
    const canvas = createInfiniteCanvas({
        container: container,
        images: samplePool(manifest.images, POOL_LIMIT)
    });

    /* --- load complete (real, or backstopped if the pool stalls) --- */
    let completeFired = false;
    function fireComplete() {
        if (completeFired) return;
        completeFired = true;
        document.dispatchEvent(new CustomEvent("counter:load-complete"));
    }

    /* No WebGL (or no canvas): nothing to load, so let the counter finish and
       the page reveal over an empty (cream) canvas. */
    if (!canvas) {
        fireComplete();
        function fireShownNoCanvas() {
            document.dispatchEvent(new CustomEvent("counter:canvas-shown"));
        }
        document.addEventListener("counter:reveal-canvas", fireShownNoCanvas, { once: true });
        if (document.__counterCanvasRequested) fireShownNoCanvas();
        return;
    }

    /* A filter's sample is drawn once and held until it's actually shown, so the
       set warmed on hover is the same set the click reveals. Dropping it after
       use means coming back to a filter later re-draws — every visit to "the
       Team" is a different Team. */
    const pending = new Map();
    function poolFor(filterId) {
        if (!pending.has(filterId)) {
            pending.set(filterId, samplePool(imagesForFilter(manifest, filterId), POOL_LIMIT));
        }
        return pending.get(filterId);
    }

    buildMenu(
        manifest,
        function (filterId) {
            const pool = poolFor(filterId);
            pending.delete(filterId);
            return canvas.setFilter(pool, anchorForFilter(manifest, filterId));
        },
        function (filterId) {
            canvas.prefetch(poolFor(filterId));
        }
    );

    /* Loader handshake:
       here     --counter:load-progress--->  (available; main runs its own counter)
       here     --counter:load-complete--->  main.js finishes the counter to 100
       main.js  --counter:reveal-canvas--->  fade the images in (beat 1)
       main.js  --counter:zoom-canvas----->  zoom through two chunks (beat 2)
       here     --counter:canvas-shown---->  main.js flips the blend + menu in
       main.js  --counter:arm-interaction->  watch for the first mouse move */
    canvas.preload(
        function (frac) {
            document.dispatchEvent(new CustomEvent("counter:load-progress", {
                detail: { progress: frac }
            }));
        },
        fireComplete
    );
    /* Backstop: if the pool never finishes (missing file, stalled network),
       complete anyway so the page can't hang on the black loading screen. */
    setTimeout(fireComplete, INTRO_SAFETY_MS);

    /* Beat 1 — fade the images up behind the collapsing curtain. */
    let faded = false;
    function doFadeIn() {
        if (faded) return;
        faded = true;
        canvas.fadeIn();
    }
    document.addEventListener("counter:reveal-canvas", doFadeIn);
    if (document.__counterCanvasRequested) doFadeIn();

    /* Beat 2 — zoom through two chunks, then report the reveal done. */
    let zoomed = false;
    function doZoom() {
        if (zoomed) return;
        zoomed = true;

        let shown = false;
        function fireShown() {
            if (shown) return;
            shown = true;
            document.dispatchEvent(new CustomEvent("counter:canvas-shown"));
        }

        const tl = canvas.zoom(fireShown);
        if (!tl) fireShown();
    }
    document.addEventListener("counter:zoom-canvas", doZoom);
    if (document.__counterCanvasZoom) doZoom();

    document.addEventListener("counter:arm-interaction", function () {
        canvas.armFirstMove();
    }, { once: true });
}

boot();
