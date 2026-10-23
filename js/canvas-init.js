/* ============================================
   COUNTER- CLT — INFINITE CANVAS BOOTSTRAP
   ============================================ */

import { createInfiniteCanvas } from "./infinite-canvas.js";

const MANIFEST_URL = "js/canvas-manifest.json";
const BASE_LABEL = "Menu";

const INTRO_SAFETY_MS = 14000;

const isTouch = window.matchMedia("(pointer: coarse)").matches;

const POOL_LIMIT = isTouch ? 28 : 60;

const DEFAULT_ANCHORS = {
    experience: [-1, -1],
    design:     [ 1, -1],
    details:    [ 1,  1],
    menus:      [-1,  1],
    beverages:  [ 0,  1],
    team:       [ 0,  0]
};

const DEFAULT_INTRO_CAPS = { menu: 2 };

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

function layoutForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    return (filter && filter.layout) || "scatter";
}

function viewSide(manifest, viewId) {
    const v = (manifest.views || []).find(function (x) { return x.id === viewId; });
    return v ? v.side : null;
}

function sideForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    return (filter && filter.side) || "right";
}

const OPPOSITE = {
    left: "right", right: "left", top: "bottom", bottom: "top", center: "split",

    diagonal: "corner"
};

function panelSideForFilter(manifest, filterId) {
    const filter = filterById(manifest, filterId);
    if (filter) {
        if (filter.layout !== "reel") return "left";
        return OPPOSITE[filter.side] || "left";
    }

    const side = viewSide(manifest, filterId);
    return side ? (OPPOSITE[side] || "left") : "left";
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function samplePool(entries, limit, caps) {
    const byFolder = new Map();
    entries.forEach(function (img) {
        if (!byFolder.has(img.folder)) byFolder.set(img.folder, []);
        byFolder.get(img.folder).push(img);
    });

    const buckets = [];
    byFolder.forEach(function (list, folder) {
        const cap = caps && caps[folder];
        const shuffled = shuffle(list.slice());
        buckets.push(cap > 0 ? shuffled.slice(0, cap) : shuffled);
    });

    const available = buckets.reduce(function (n, b) { return n + b.length; }, 0);
    if (available <= limit) return shuffle([].concat.apply([], buckets));

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

    let currentKind = null;

    function setOpen(next) {
        open = next;
        menu.classList.toggle("is-open", open);

        toggle.setAttribute("aria-expanded", String(open));
        if (burger) {
            burger.setAttribute("aria-expanded", String(open));
            burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        }
    }

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

            const anchor = anchorForFilter(manifest, current);

            const wasView = currentKind === "view";
            setActive(null, null);
            setOpen(false);
            run(wasView ? handlers.onClearView() : handlers.onClear(anchor));
        });
    }

    document.addEventListener("click", function (e) {
        if (open && !menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) setOpen(false);
    });

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

    const canvas = createInfiniteCanvas({
        container: container,
        images: samplePool(manifest.images, POOL_LIMIT, introCaps),

        focusIndicator: document.getElementById("canvas-focus-plus"),

        onFocusChange: function (focused) {
            document.dispatchEvent(new CustomEvent("counter:photo-focus", {
                detail: { focused: focused }
            }));
        }
    });

    let completeFired = false;
    function fireComplete() {
        if (completeFired) return;
        completeFired = true;
        document.dispatchEvent(new CustomEvent("counter:load-complete"));
    }

    if (!canvas) {
        fireComplete();
        function fireShownNoCanvas() {
            document.dispatchEvent(new CustomEvent("counter:canvas-shown"));
        }
        document.addEventListener("counter:reveal-canvas", fireShownNoCanvas, { once: true });
        if (document.__counterCanvasRequested) fireShownNoCanvas();
        return;
    }

    const pending = new Map();
    function poolFor(filterId) {
        if (!pending.has(filterId)) {

            pending.set(filterId, samplePool(imagesForFilter(manifest, filterId), POOL_LIMIT));
        }
        return pending.get(filterId);
    }

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

                selectable: false,
                onSpread: function () { emit("counter:filter-spread", filterId); }
            });
        },

        onClear: function (anchor) {
            emit("counter:filter-change", null);

            return canvas.setFilter(samplePool(manifest.images, POOL_LIMIT, introCaps), {
                anchor: anchor,
                layout: "scatter",

                selectable: true,
                onSpread: function () { emit("counter:filter-spread", null); }
            });
        },

        onView: function (viewId) {
            emit("counter:filter-change", viewId);
            return canvas.setArrangement(viewSide(manifest, viewId), function () {
                emit("counter:filter-spread", viewId);
            });
        },

        onClearView: function () {
            emit("counter:filter-change", null);
            return canvas.setArrangement(null, function () {
                emit("counter:filter-spread", null);
            });
        },

        onHover: function (filterId) {

            if (!filterById(manifest, filterId)) return;
            canvas.prefetch(poolFor(filterId));
        }
    });

    canvas.preload(
        function (frac) {
            document.dispatchEvent(new CustomEvent("counter:load-progress", {
                detail: { progress: frac }
            }));
        },
        fireComplete
    );

    setTimeout(fireComplete, INTRO_SAFETY_MS);

    let faded = false;
    function doFadeIn() {
        if (faded) return;
        faded = true;
        canvas.fadeIn();
    }
    document.addEventListener("counter:reveal-canvas", doFadeIn);
    if (document.__counterCanvasRequested) doFadeIn();

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

        if (!isTouch) {
            const warmed = manifest.images.map(function (img) { return img.src; });
            canvas.warmAll(warmed);
        }
    }, { once: true });
}

boot();
