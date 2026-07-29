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

/* Fallback intro caps, matching INTRO_CAPS in tools/generate-manifest.py — used
   only if the manifest predates the field. See samplePool. */
const DEFAULT_INTRO_CAPS = { menu: 2 };

/* Hover only counts as intent after this long, so sweeping the pointer down the
   option list doesn't kick off a download for every filter at once. */
const PREFETCH_DWELL_MS = 140;

function imagesForFilter(manifest, filterId) {
    return manifest.images.filter(function (img) {
        return img.filters.indexOf(filterId) !== -1;
    });
}

function filterById(manifest, filterId) {
    return manifest.filters.find(function (f) { return f.id === filterId; });
}

function anchorForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    if (filter && Array.isArray(filter.anchor) && filter.anchor.length === 2) {
        return filter.anchor;
    }
    return DEFAULT_ANCHORS[filterId] || [0, 0];
}

/* What the images do once they've gathered — "reel" for a scrolling strip,
   "scatter" (the default) to fly back out into the 3D field. */
function layoutForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    return (filter && filter.layout) || "scatter";
}

/* An arrangement's reel side, from manifest.views. */
function viewSide(manifest, viewId) {
    const v = (manifest.views || []).find(function (x) { return x.id === viewId; });
    return v ? v.side : null;
}

/* Which edge a reel strip runs along. */
function sideForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    return (filter && filter.side) || "right";
}

/* Where a filter's copy goes, given where its strip runs. "center" has no
   opposite edge — the strip owns the middle — so its copy splits into a band
   above and a band below it. */
const OPPOSITE = {
    left: "right", right: "left", top: "bottom", bottom: "top", center: "split",
    /* A rising diagonal leaves the top-left and bottom-right triangles clear;
       the copy takes the top-left one. */
    diagonal: "corner"
};

/* Where the filter's copy panel goes: opposite the strip, so the words sit in
   the half of the frame the images have left empty. Derived rather than
   declared, so the manifest's `side` is the only place the pairing lives. */
function panelSideForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    if (filter) {
        if (filter.layout !== "reel") return "left";
        return OPPOSITE[filter.side] || "left";
    }
    /* Views aren't in `filters` — look them up by their own side. */
    const side = viewSide(manifest, filterId);
    return side ? (OPPOSITE[side] || "left") : "left";
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
   from 202 would under-serve the small folders and could miss one outright.
   Re-shuffled on every call, so each visit — and each return to the same filter
   — draws a different set.

   `caps` optionally limits what a given folder may contribute (e.g. { menu: 2 }
   for the opening view). A capped folder still gets dealt into the rotation, so
   it is present but not prominent; the images the cap holds back are exactly
   what makes choosing that folder's filter worth doing. Caps are for the
   unfiltered view only — pass nothing when building a filter's own pool. */
function samplePool(entries, limit, caps) {
    const byFolder = new Map();
    entries.forEach(function (img) {
        if (!byFolder.has(img.folder)) byFolder.set(img.folder, []);
        byFolder.get(img.folder).push(img);
    });

    /* Shuffle within each folder, then apply that folder's cap — shuffle first
       so a capped folder still contributes a *different* couple of images each
       time rather than the same two. */
    const buckets = [];
    byFolder.forEach(function (list, folder) {
        const cap = caps && caps[folder];
        const shuffled = shuffle(list.slice());
        buckets.push(cap > 0 ? shuffled.slice(0, cap) : shuffled);
    });

    const available = buckets.reduce(function (n, b) { return n + b.length; }, 0);
    if (available <= limit) return shuffle([].concat.apply([], buckets));

    /* Shuffle the folder order too, so the remainder (when the limit doesn't
       divide evenly) doesn't always land on the same folders. */
    shuffle(buckets);

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
   option list; choosing one moves the canvas, updates the label, and collapses.
   Once a filter is set an X appears beside the label to clear back to the full
   library. Handlers:
     onSelect(filterId) -> timeline   run a switch; we stay locked until it lands
     onClear(anchor)    -> timeline   same, back to unfiltered, gathering at the
                                      corner of the filter being cleared
     onHover(filterId)                head start on an option's images */
function buildMenu(manifest, handlers) {
    const menu = document.getElementById("canvas-menu");
    const toggle = document.getElementById("canvas-menu-toggle");
    const label = document.getElementById("canvas-menu-label");
    const optionsWrap = document.getElementById("canvas-menu-options");
    const clearBtn = document.getElementById("canvas-menu-clear");
    const burger = document.getElementById("canvas-menu-burger");
    const viewsWrap = document.getElementById("canvas-menu-views");
    if (!menu || !toggle || !label || !optionsWrap) return;

    function addOption(wrap, id, text, kind) {
        const btn = document.createElement("button");
        btn.className = "canvas-menu-option";
        btn.type = "button";
        btn.textContent = text;
        btn.dataset.filter = id;
        btn.dataset.kind = kind;
        btn.setAttribute("aria-pressed", "false");
        wrap.appendChild(btn);
        return btn;
    }

    /* One list, two groups. Filters change which images are shown; views
       re-arrange the ones already there. They share the label, the pressed
       state and the clear button, so `buttons` spans both — choosing either
       must un-choose whatever was chosen before. */
    const buttons = manifest.filters.map(function (filter) {
        return addOption(optionsWrap, filter.id, filter.label, "filter");
    });

    const views = manifest.views || [];
    if (viewsWrap) {
        views.forEach(function (view) {
            buttons.push(addOption(viewsWrap, view.id, view.label, "view"));
        });
    }

    let open = false;
    let busy = false;
    let current = null;
    /* "filter" or "view" — clearing has to undo whichever kind is showing, and
       the two leave the canvas by different routes. */
    let currentKind = null;

    function setOpen(next) {
        open = next;
        menu.classList.toggle("is-open", open);
        /* Two controls open the same panel — the label and the three bars — so
           both have to report the same state. */
        toggle.setAttribute("aria-expanded", String(open));
        if (burger) {
            burger.setAttribute("aria-expanded", String(open));
            burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        }
    }

    /* Label, pressed states and the X's presence all follow from one place, so
       selecting and clearing can't drift out of sync. `btn` is null when
       clearing. */
    function setActive(filterId, btn) {
        current = filterId;
        currentKind = btn ? btn.dataset.kind : null;
        label.textContent = filterId ? BASE_LABEL + " — " + btn.textContent : BASE_LABEL;
        buttons.forEach(function (b) {
            const active = b === btn;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
        });
        menu.classList.toggle("has-filter", Boolean(filterId));
    }

    /* Lock the control for the length of the transition it starts. */
    function run(timeline) {
        busy = true;
        if (timeline && timeline.eventCallback) {
            timeline.eventCallback("onComplete", function () { busy = false; });
        } else {
            busy = false;
        }
    }

    toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        if (busy) return;
        setOpen(!open);
    });

    if (burger) {
        burger.addEventListener("click", function (e) {
            e.stopPropagation();
            if (busy) return;
            setOpen(!open);
        });
    }

    optionsWrap.addEventListener("click", function (e) {
        const btn = e.target.closest(".canvas-menu-option");
        if (!btn || busy) return;

        if (btn.dataset.filter !== current) {
            setActive(btn.dataset.filter, btn);
            run(btn.dataset.kind === "view"
                ? handlers.onView(current)
                : handlers.onSelect(current));
        }
        setOpen(false);
    });

    /* The two groups live in separate elements, so the views need their own
       delegate — same handler, same lockout. */
    if (viewsWrap) {
        viewsWrap.addEventListener("click", function (e) {
            const btn = e.target.closest(".canvas-menu-option");
            if (!btn || busy) return;
            if (btn.dataset.filter !== current) {
                setActive(btn.dataset.filter, btn);
                run(handlers.onView(current));
            }
            setOpen(false);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (busy || !current) return;
            /* Read the outgoing filter's corner before dropping it: clearing
               gathers where that filter gathered, so the move reads as the
               reverse of choosing it rather than as a separate gesture. */
            const anchor = anchorForFilter(manifest, current);
            /* A view arrived without gathering, so it leaves without gathering:
               an exit that collapses into a corner would not be the reverse of
               the way in, it would be a different move entirely. */
            const wasView = currentKind === "view";
            setActive(null, null);
            setOpen(false);
            run(wasView ? handlers.onClearView() : handlers.onClear(anchor));
        });
    }

    /* Click anywhere else, or press Escape, to collapse */
    document.addEventListener("click", function (e) {
        if (open && !menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) setOpen(false);
    });

    /* Dwell on an option (pointer or keyboard focus) and its images start
       downloading, so by the time it's clicked the collect has less to wait on. */
    if (typeof handlers.onHover === "function") {
        let dwell = null;
        buttons.forEach(function (btn) {
            function arm() {
                if (btn.dataset.filter === current) return;
                clearTimeout(dwell);
                dwell = setTimeout(function () { handlers.onHover(btn.dataset.filter); },
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

    const introCaps = manifest.introCaps || DEFAULT_INTRO_CAPS;

    /* The label stays "Menu" until a filter is chosen, so the opening view is
       the whole library — every folder — not one filter's slice. Capped and
       re-drawn per visit, so the opening field is a different 60 every time, and
       folder-capped so the menu shots appear without giving themselves away. */
    const canvas = createInfiniteCanvas({
        container: container,
        images: samplePool(manifest.images, POOL_LIMIT, introCaps),
        /* Marker the canvas parks over the selected photo */
        focusIndicator: document.getElementById("canvas-focus-plus"),
        /* An image has been opened (or closed) — main.js clears the chrome */
        onFocusChange: function (focused) {
            document.dispatchEvent(new CustomEvent("counter:photo-focus", {
                detail: { focused: focused }
            }));
        }
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
            /* No caps here: a filter shows its folder in full. That's the whole
               point of the intro cap — the menu shots held back from the opening
               view are what choosing "the Menus" reveals. */
            pending.set(filterId, samplePool(imagesForFilter(manifest, filterId), POOL_LIMIT));
        }
        return pending.get(filterId);
    }

    /* Two beats the rest of the page hangs off (main.js owns the overlay and the
       copy panels; this module owns the canvas):
         filter-change — a switch has been asked for. filterId is null when
                         clearing back to the whole library.
         filter-spread — the new images are being placed. Not the pool swap,
                         which happens ~1s earlier inside the pinch while
                         nothing is visibly moving. */
    function emit(name, filterId) {
        document.dispatchEvent(new CustomEvent(name, {
            detail: {
                filterId: filterId,
                panelSide: filterId ? panelSideForFilter(manifest, filterId) : null
            }
        }));
    }

    buildMenu(manifest, {
        onSelect: function (filterId) {
            const pool = poolFor(filterId);
            pending.delete(filterId);
            emit("counter:filter-change", filterId);
            return canvas.setFilter(pool, {
                anchor: anchorForFilter(manifest, filterId),
                layout: layoutForFilter(manifest, filterId),
                side: sideForFilter(manifest, filterId),
                /* Picking a photo out of a filter's composition means nothing,
                   so selection is off for every filtered view. */
                selectable: false,
                onSpread: function () { emit("counter:filter-spread", filterId); }
            });
        },

        onClear: function (anchor) {
            emit("counter:filter-change", null);
            /* A fresh draw of the library, capped as on first load — clearing
               returns you to the opening view, not to the exact one you left. */
            return canvas.setFilter(samplePool(manifest.images, POOL_LIMIT, introCaps), {
                anchor: anchor,
                layout: "scatter",
                /* Back on the whole library, so photos are selectable again */
                selectable: true,
                onSpread: function () { emit("counter:filter-spread", null); }
            });
        },

        /* Views keep the pool and re-lay it, so there is no sample to draw and
           nothing to prefetch — just a different arrangement of what is already
           on the canvas. */
        onView: function (viewId) {
            emit("counter:filter-change", viewId);
            return canvas.setArrangement(viewSide(manifest, viewId), function () {
                emit("counter:filter-spread", viewId);
            });
        },

        /* Undo a view the same way it was made — dissolve back to the field,
           no gather, keeping the pool it was re-laying. */
        onClearView: function () {
            emit("counter:filter-change", null);
            return canvas.setArrangement(null, function () {
                emit("counter:filter-spread", null);
            });
        },

        onHover: function (filterId) {
            /* Views have no pool of their own to warm. */
            if (!filterById(manifest, filterId)) return;
            canvas.prefetch(poolFor(filterId));
        }
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

        /* The opening view is a capped sample, but every filter draws from the
           whole library — so once the intro is over and the canvas is idle,
           fetch the rest in the background. Without this, a filter switch is
           the first time those files are ever requested, and on a cold
           connection they land late enough to read as gaps in the field.
           Ordered so the images a filter would reach for come before the ones
           already on screen. */
        const warmed = manifest.images.map(function (img) { return img.src; });
        canvas.warmAll(warmed);
    }, { once: true });
}

boot();
