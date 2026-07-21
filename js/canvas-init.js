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

function imagesForFilter(manifest, filterId) {
    return manifest.images.filter(function (img) {
        return img.filters.indexOf(filterId) !== -1;
    });
}

/* Builds the collapse/expand Menu: collapsed it shows "Menu" (or
   "Menu — the Experience" once something is chosen); clicking expands the
   option list; choosing one fades the canvas, updates the label, and
   collapses. `onSelect` returns the GSAP timeline so we can lock out further
   clicks until the fade finishes. */
function buildMenu(manifest, onSelect) {
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
       the whole library — every folder — not one filter's slice. */
    const canvas = createInfiniteCanvas({
        container: container,
        images: manifest.images
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

    buildMenu(manifest, function (filterId) {
        return canvas.setFilter(imagesForFilter(manifest, filterId));
    });

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
