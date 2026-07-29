/* ============================================
   COUNTER- CLT — MAIN.js
   ============================================ */
(function () {
    "use strict";

    const loader = document.getElementById("loader");
    const definitionPhonetic = document.querySelector(".definition-phonetic");
    const definitionText = document.querySelector(".definition-text");
    const loadingCounter = document.getElementById("loading-counter");
    const brandMark = document.querySelector(".brand-mark");
    const siteGrid = document.getElementById("site-grid");
    const canvasMenu = document.getElementById("canvas-menu");

    /* The counter climbs to 93 on this fixed ramp, then waits on the real load
       before finishing to 100. COLLAPSE_S is how long the loader box takes to
       shrink to nothing. (The 2-chunk zoom's length lives in infinite-canvas.js.) */
    const COUNT_RAMP_S = 2.0;
    const COLLAPSE_S = 0.9;

    const CANVAS_FALLBACK_MS = 18000;

 
    function playLoadingAnimation() {
      
        document.body.classList.add("intro");
        gsap.set([brandMark, siteGrid, canvasMenu, ".pillars-tab"], { opacity: 0 });
        gsap.set([definitionText, loadingCounter], { opacity: 0 });
        gsap.set(definitionPhonetic, { opacity: 0, y: 20 });

        const counterProxy = { v: 0 };
        function paintCounter() {
            if (loadingCounter) loadingCounter.textContent = Math.round(counterProxy.v);
        }
        paintCounter();

       
        let reached93 = false;
        let loadDone = false;
        let finished = false;

        function finishCounter() {
            if (finished || !reached93 || !loadDone) return;
            finished = true;
            gsap.to(counterProxy, {
                v: 100, duration: 0.5, ease: "power2.out",
                onUpdate: paintCounter, onComplete: beginReveal
            });
        }

        document.addEventListener("counter:load-complete", function () {
            loadDone = true;
            finishCounter();
        }, { once: true });
       
        setTimeout(function () { loadDone = true; finishCounter(); }, CANVAS_FALLBACK_MS);
        gsap.timeline({ delay: 0.3 })
            .to(definitionPhonetic, { opacity: 1, y: 0, duration: 1.0, ease: "power3.out" })
            .to(definitionText, { opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.3")
            .to(loadingCounter, { opacity: 1, duration: 0.6, ease: "power2.out" }, "-=0.2")
            .to(counterProxy, {
                v: 93, duration: COUNT_RAMP_S, ease: "power1.out", onUpdate: paintCounter
            }, ">-0.1")
            .call(function () { reached93 = true; finishCounter(); });

        function beginReveal() {
            const tl = gsap.timeline();

            tl.to(loadingCounter, { opacity: 0, duration: 0.4, ease: "power2.in" }, 0);

            tl.add(function () { document.body.classList.remove("intro"); }, 0);

            tl.add(function () {
                document.__counterCanvasRequested = true;
                document.dispatchEvent(new CustomEvent("counter:reveal-canvas"));
            }, 0);

            gsap.set(loader, {
                left: "50%", top: "50%", xPercent: -50, yPercent: -50,
                width: "100vw", height: "100vh"
            });
            tl.to(loader, { width: 0, height: 0, duration: COLLAPSE_S, ease: "power2.inOut" }, 0.15);
            tl.set(loader, { display: "none" });

            tl.add(function () {
                document.__counterCanvasZoom = true;
                document.dispatchEvent(new CustomEvent("counter:zoom-canvas"));
            });
        }

        document.addEventListener("counter:canvas-shown", function () {
            document.body.classList.add("is-immersive");
            gsap.set(".hero-definition-overlay", { zIndex: 120 });

            gsap.timeline()
                .to(brandMark, { opacity: 1, duration: 0.8, ease: "power2.out" })
                .to(siteGrid,  { opacity: 1, duration: 0.9, ease: "power2.out" }, "-=0.6")
                .to(canvasMenu, { opacity: 1, duration: 0.7, ease: "power2.out" }, "-=0.6")
                .to(".pillars-tab", { opacity: 1, duration: 0.7, ease: "power2.out" }, "-=0.55")
                .call(function () {
                    document.dispatchEvent(new CustomEvent("counter:arm-interaction"));
                });
        }, { once: true });
    }

   
    var PHONETIC_DIMMED = 0.05;

    var filterPanels = document.querySelectorAll(".filter-panel");

    function panelFor(filterId) {
        for (var i = 0; i < filterPanels.length; i++) {
            if (filterPanels[i].dataset.filter === filterId) return filterPanels[i];
        }
        return null;
    }

    /* Whether a filter is on, so anything that restores the definition line
       (the partners panel closing) puts it back to the right value. */
    var filterActive = false;

    document.addEventListener("counter:filter-change", function (e) {
        var filtered = Boolean(e.detail && e.detail.filterId);
        filterActive = filtered;

        gsap.to(definitionText, {
            opacity: filtered ? 0 : 1, duration: 0.5, ease: "power2.out"
        });
        gsap.to(definitionPhonetic, {
            opacity: filtered ? PHONETIC_DIMMED : 1, duration: 0.7, ease: "power2.out"
        });

        if (filterPanels.length) {
            gsap.to(filterPanels, { autoAlpha: 0, duration: 0.4, ease: "power2.in" });
        }
    });

    /* Tab groups inside a copy panel. Generic — any panel can use one by
       adding .filter-panel-tabs with .filter-panel-tab buttons and matching
       .filter-panel-tabpanel blocks. */
    document.querySelectorAll(".filter-panel-tabs").forEach(function (group) {
        var tabs = Array.prototype.slice.call(group.querySelectorAll(".filter-panel-tab"));
        var panes = Array.prototype.slice.call(group.querySelectorAll(".filter-panel-tabpanel"));
        if (!tabs.length) return;

        /* Narrow screens get a dropdown instead of a column of tabs. It is
           built from the tabs rather than authored alongside them, so the two
           can never drift apart — and a real <select> means the platform's own
           picker on a phone, which no styled div gets close to. */
        var picker = document.createElement("select");
        picker.className = "filter-panel-tabselect";
        picker.setAttribute("aria-label", group.querySelector(".filter-panel-tablist")
            ? group.querySelector(".filter-panel-tablist").getAttribute("aria-label") || "Choose a question"
            : "Choose a question");
        tabs.forEach(function (tab, i) {
            var opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = tab.textContent.trim();
            picker.appendChild(opt);
        });
        group.insertBefore(picker, group.firstChild);

        function select(index) {
            tabs.forEach(function (tab, i) {
                var on = i === index;
                tab.setAttribute("aria-selected", String(on));
                /* One stop in the tab order for the whole group; the arrows move
                   between them from there. */
                tab.tabIndex = on ? 0 : -1;
            });
            panes.forEach(function (pane, i) {
                pane.classList.toggle("is-active", i === index);
            });
            if (picker.selectedIndex !== index) picker.selectedIndex = index;
        }

        picker.addEventListener("change", function () {
            select(picker.selectedIndex);
        });

        tabs.forEach(function (tab, i) {
            tab.addEventListener("click", function () { select(i); });
            tab.addEventListener("keydown", function (e) {
                var step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                var next = (i + step + tabs.length) % tabs.length;
                select(next);
                tabs[next].focus();
            });
        });

        select(0);
    });

    document.addEventListener("counter:filter-spread", function (e) {
        var panel = panelFor(e.detail && e.detail.filterId);
        if (!panel) return;

        var side = (e.detail && e.detail.panelSide) || "left";
        panel.dataset.side = side;

        var from = { autoAlpha: 0 };
        if (side === "left") from.x = -22;
        else if (side === "right") from.x = 22;
        else if (side === "top") from.y = -22;
        else if (side === "bottom") from.y = 22;
        /* "split" has a band at each end of the frame — a single direction
           would carry one of them the wrong way, so it just fades. */

        gsap.fromTo(panel, from,
            { autoAlpha: 1, x: 0, y: 0, duration: 1.0, ease: "power3.out" });
    });

    
    var FOCUS_CHROME = [brandMark, siteGrid, canvasMenu, ".pillars-tab", ".hero-definition-overlay"];

    document.addEventListener("counter:photo-focus", function (e) {
        var open = Boolean(e.detail && e.detail.focused);
        document.body.classList.toggle("photo-focus", open);
        gsap.to(FOCUS_CHROME, {
            opacity: open ? 0 : 1,
            duration: open ? 0.45 : 0.6,
            ease: "power2.out"
        });
    });


    /* Partners: the 501(c)(3) panel takes the definition line's place and the
       canvas drops back to almost nothing behind it. Closes on a click
       anywhere outside itself, on Escape, or on any canvas-menu selection. */
    var PARTNERS_CANVAS_DIM = 0.05;

    var partnersLink = document.getElementById("partners-display-link");
    var partnersPanel = document.getElementById("partners-panel");
    var partnersCloseBtn = document.getElementById("partners-close");
    var infiniteCanvas = document.getElementById("infinite-canvas");
    var partnersOpen = false;

    /* Both the footer link and the icon in the canvas menu drive the same
       panel, so they are handled as one control throughout — including the
       outside-click test, which must not treat either as "outside". */
    /* Anything carrying data-partners-toggle drives the panel — the footer
       link, the icon in the menu, and the entry in the mobile More list. Opting
       in by attribute means a new one needs no change here. */
    var partnersToggles = Array.prototype.slice.call(
        document.querySelectorAll("[data-partners-toggle]"));

    function isPartnersToggle(node) {
        return partnersToggles.some(function (el) { return el.contains(node); });
    }

    function setPartners(open) {
        if (!partnersPanel || open === partnersOpen) return;
        partnersOpen = open;

        partnersPanel.classList.toggle("is-open", open);
        partnersPanel.setAttribute("aria-hidden", String(!open));
        document.body.classList.toggle("partners-open", open);
        partnersToggles.forEach(function (el) {
            el.setAttribute("aria-expanded", String(open));
        });

        /* Pin to wherever the definition line currently sits — it moves with
           the logo's height, so this can't be a fixed number. */
        if (open) {
            partnersPanel.style.top =
                Math.round(definitionText.getBoundingClientRect().top) + "px";
        }

        gsap.to(definitionText, {
            opacity: open ? 0 : (filterActive ? 0 : 1),
            duration: 0.4,
            ease: "power2.out"
        });

        if (open) {
            gsap.fromTo(partnersPanel,
                { autoAlpha: 0, y: 12 },
                { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out" });
        } else {
            gsap.to(partnersPanel,
                { autoAlpha: 0, y: 8, duration: 0.3, ease: "power2.in" });
        }

        if (infiniteCanvas) {
            gsap.to(infiniteCanvas, {
                opacity: open ? PARTNERS_CANVAS_DIM : 1,
                duration: 0.6,
                ease: "power2.out"
            });
        }
    }

    partnersToggles.forEach(function (el) {
        /* partnersLink has its own handler further down. */
        if (el === partnersLink) return;
        el.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            setPartners(!partnersOpen);
        });
    });

    if (partnersLink && partnersPanel) {
        partnersLink.addEventListener("click", function (e) {
            e.preventDefault();
            /* Stop it reaching the document handler below, which would read the
               opening click as the click that closes it. */
            e.stopPropagation();
            setPartners(!partnersOpen);
        });

        if (partnersCloseBtn) {
            partnersCloseBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                setPartners(false);
            });
        }

        /* Anywhere outside closes it; inside is left alone so the partner links
           still work. Capture phase, because several controls (the canvas menu
           toggle among them) stop propagation in the bubble phase and would
           otherwise leave the panel stranded open. The link itself is excluded
           so its own handler can do the toggling — closing here first would let
           that handler immediately reopen it. */
        document.addEventListener("click", function (e) {
            if (!partnersOpen) return;
            if (partnersPanel.contains(e.target) || isPartnersToggle(e.target)) return;
            setPartners(false);
        }, true);

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") setPartners(false);
        });

        /* Choosing anything from the canvas menu closes it too. */
        document.addEventListener("counter:filter-change", function () {
            setPartners(false);
        });

        window.addEventListener("resize", function () {
            if (!partnersOpen) return;
            partnersPanel.style.top =
                Math.round(definitionText.getBoundingClientRect().top) + "px";
        });
    }

    /* Counter Pillars. The tab hover-expands on its own (CSS); clicking it puts
       the three columns up, dims the canvas to almost nothing and takes the
       wordmark with it, so the copy has the frame to itself. */
    var PILLARS_CANVAS_DIM = 0.05;

    var pillarsTab = document.getElementById("pillars-tab");
    var pillarsPanel = document.getElementById("pillars-panel");
    var pillarsGrid = pillarsPanel ? pillarsPanel.querySelector(".pillars-grid") : null;
    var heroOverlay = document.querySelector(".hero-definition-overlay");
    var pillarsOpen = false;

    function setPillars(open) {
        if (!pillarsPanel || open === pillarsOpen) return;
        pillarsOpen = open;

        pillarsPanel.classList.toggle("is-open", open);
        pillarsPanel.setAttribute("aria-hidden", String(!open));
        pillarsTab.classList.toggle("is-open", open);
        pillarsTab.setAttribute("aria-expanded", String(open));
        document.body.classList.toggle("pillars-open", open);

        if (open) {
            gsap.fromTo(pillarsPanel,
                { autoAlpha: 0, y: 14 },
                { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" });
        } else {
            gsap.to(pillarsPanel, { autoAlpha: 0, y: 10, duration: 0.3, ease: "power2.in" });
        }

        /* The hero mark goes entirely — at 0.05 the canvas is already a ghost,
           and leaving the wordmark over the columns would be the only thing
           competing with them. */
        if (heroOverlay) {
            gsap.to(heroOverlay, {
                opacity: open ? 0 : 1, duration: 0.5, ease: "power2.out", overwrite: "auto"
            });
        }

        if (infiniteCanvas) {
            gsap.to(infiniteCanvas, {
                opacity: open ? PILLARS_CANVAS_DIM : 1,
                duration: 0.6,
                ease: "power2.out",
                /* partners and legal drive this same property — going straight
                   from one to another must not leave two tweens fighting. */
                overwrite: "auto"
            });
        }
    }

    /* Mobile only: the tab sits under the definition line, which moves with
       the logo's height — so its position is measured rather than guessed,
       the same way the partners panel finds that line. On desktop the tab is
       pinned to the left edge by CSS, so any inline `top` is cleared instead. */
    var PILLARS_MOBILE_QUERY = "(max-width: 760px)";

    function placePillarsTab() {
        if (!pillarsTab || !definitionText) return;
        if (!window.matchMedia(PILLARS_MOBILE_QUERY).matches) {
            pillarsTab.style.top = "";
            return;
        }
        var line = definitionText.getBoundingClientRect();
        pillarsTab.style.top = Math.round(line.bottom + 26) + "px";
    }

    if (pillarsTab && pillarsPanel) {
        var pillarsCloseBtn = document.getElementById("pillars-close");
        if (pillarsCloseBtn) {
            pillarsCloseBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                setPillars(false);
            });
        }

        placePillarsTab();
        window.addEventListener("resize", placePillarsTab);
        /* The definition only reaches its final place once the intro has run. */
        document.addEventListener("counter:arm-interaction", placePillarsTab, { once: true });

        pillarsTab.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            setPillars(!pillarsOpen);
        });

        /* Anywhere else closes it. Capture phase for the same reason as the
           partners panel: several controls stop propagation while bubbling and
           would otherwise strand this open. The tab is excluded so its own
           handler does the toggling. */
        document.addEventListener("click", function (e) {
            if (!pillarsOpen || pillarsTab.contains(e.target)) return;
            /* Don't close out from under someone selecting a pillar's copy. */
            var selection = window.getSelection();
            if (pillarsGrid && pillarsGrid.contains(e.target) &&
                selection && selection.type === "Range" && String(selection).trim()) return;
            setPillars(false);
        }, true);

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && pillarsOpen) setPillars(false);
        });

        /* Choosing a filter is a different intent — put the canvas back. */
        document.addEventListener("counter:filter-change", function () {
            setPillars(false);
        });
    }

    /* Legal documents (terms / privacy), modelled on the Codrops WebGL-text
       layout: real DOM text, a mask reveal as each block enters view, and a
       chromatic shift driven by scroll velocity. Scrolling is confined to
       .legal-scroll, and the canvas sits dimmed behind it. */
    var LEGAL_CANVAS_DIM = 0.5;
    /* Peak RGB split, in px, and peak lean, in degrees, at full scroll speed. */
    var LEGAL_MAX_SHIFT = 7;
    var LEGAL_MAX_SKEW = 1.4;
    /* Scroll delta (px/frame) that counts as full speed. */
    var LEGAL_VEL_FULL = 55;

    var legalWrapper = document.getElementById("legal-wrapper");
    var legalScroll = document.getElementById("legal-scroll");
    var legalCloseBtn = document.getElementById("legal-close");
    var legalOpen = false;
    var legalObserver = null;
    var legalRaf = 0;
    var legalLastTop = 0;
    var legalVel = 0;

    function legalDocFor(kind) {
        return legalWrapper.querySelector('.legal-doc[data-legal="' + kind + '"]');
    }

    /* Velocity is measured rather than listened for: a scroll event fires at
       whatever rate the input device dictates, but the shift has to build and
       release smoothly, so it's eased toward the reading every frame instead. */
    function legalFrame() {
        if (!legalOpen) return;
        legalRaf = requestAnimationFrame(legalFrame);

        var top = legalScroll.scrollTop;
        var delta = top - legalLastTop;
        legalLastTop = top;
        legalVel += (delta - legalVel) * 0.18;

        var signed = Math.max(-1, Math.min(legalVel / LEGAL_VEL_FULL, 1));
        legalWrapper.style.setProperty("--legal-shift",
            (Math.abs(signed) * LEGAL_MAX_SHIFT).toFixed(2) + "px");
        legalWrapper.style.setProperty("--legal-skew",
            (signed * LEGAL_MAX_SKEW).toFixed(3) + "deg");
    }

    function setLegal(kind) {
        if (!legalWrapper || !legalScroll) return;
        var opening = Boolean(kind);
        if (opening === legalOpen && !opening) return;

        legalOpen = opening;
        legalWrapper.setAttribute("aria-hidden", String(!opening));
        document.body.classList.toggle("legal-open", opening);

        if (opening) {
            var doc = legalDocFor(kind);
            if (!doc) { legalOpen = false; return; }

            /* Only the requested document is shown; the other keeps its text in
               the DOM but out of the accessibility tree and the layout. */
            legalWrapper.querySelectorAll(".legal-doc").forEach(function (el) {
                el.hidden = el !== doc;
            });

            legalScroll.scrollTop = 0;
            legalLastTop = 0;
            legalVel = 0;
            legalWrapper.style.setProperty("--legal-shift", "0px");
            legalWrapper.style.setProperty("--legal-skew", "0deg");

            /* Watch the block that *contains* each clipped span, never the span
               itself: its hidden state is a clip-path that reduces it to zero
               area, and an observer measuring that would never see it arrive.
               Replayed on every open, not just the first. */
            var blocks = [];
            doc.querySelectorAll(".legal-reveal").forEach(function (el) {
                if (el.parentElement) blocks.push(el.parentElement);
            });
            blocks.forEach(function (el) { el.classList.remove("legal-in"); });

            if (legalObserver) legalObserver.disconnect();
            legalObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (!en.isIntersecting) return;
                    en.target.classList.add("legal-in");
                    /* One-way: a block that has arrived stays arrived. */
                    legalObserver.unobserve(en.target);
                });
            }, { root: legalScroll, rootMargin: "0px 0px -10% 0px", threshold: 0.04 });

            blocks.forEach(function (el) { legalObserver.observe(el); });

            gsap.to(legalWrapper, { autoAlpha: 1, duration: 0.5, ease: "power2.out" });
            cancelAnimationFrame(legalRaf);
            legalFrame();
        } else {
            if (legalObserver) { legalObserver.disconnect(); legalObserver = null; }
            cancelAnimationFrame(legalRaf);
            gsap.to(legalWrapper, { autoAlpha: 0, duration: 0.35, ease: "power2.in" });
        }

        if (infiniteCanvas) {
            /* overwrite:auto — the partners panel drives this same property, and
               opening one straight from the other must not leave two tweens
               fighting over it. */
            gsap.to(infiniteCanvas, {
                opacity: opening ? LEGAL_CANVAS_DIM : 1,
                duration: 0.6,
                ease: "power2.out",
                overwrite: "auto"
            });
        }
    }

    if (legalWrapper) {
        document.querySelectorAll(".grid-extra-link[data-legal]").forEach(function (link) {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                setLegal(link.dataset.legal);
            });
        });

        if (legalCloseBtn) {
            legalCloseBtn.addEventListener("click", function () { setLegal(null); });
        }

        /* Anywhere in the panel closes it — the whole surface is the dismiss
           target, the corner + is just the visible affordance. The one thing
           that must not trigger it is finishing a drag-select: a click fires at
           the end of that too, and closing the document out from under someone
           who was highlighting a passage would be maddening. */
        legalWrapper.addEventListener("click", function () {
            var selection = window.getSelection();
            if (selection && selection.type === "Range" && String(selection).trim()) return;
            setLegal(null);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && legalOpen) setLegal(null);
        });
    }

    /* Badge that rides the cursor once the reveal lands: "Drag", then "Scroll",
       then gone. Runs once, and only where there's a cursor to attach it to. */
    var HINT_DRAG_S = 1.8;
    var HINT_SCROLL_S = 1.8;
    /* Sits below-right of the pointer rather than under it — centred on the
       cursor, the arrow bubble and the word both end up behind the arrow the
       user is actually looking at. */
    var HINT_OFFSET_X = 22;
    var HINT_OFFSET_Y = 18;
    var HINT_EDGE = 10;

    var hint = document.getElementById("cursor-hint");
    var hintLabel = document.getElementById("cursor-hint-label");

    if (hint && hintLabel && window.matchMedia("(pointer: fine)").matches) {
        var hintArrows = hint.querySelectorAll(".cursor-hint-arrow");
        var hintSides = hint.querySelectorAll(".cursor-hint-side");
        var cursor = { x: 0, y: 0, known: false };
        var hintArmed = false;
        var hintDone = false;
        var followX = null;
        var followY = null;

        /* Remembers where the cursor is, starts the badge once the reveal is
           done, and drives the follow after that. Goes inert for good once the
           badge has left, so it isn't retargeting tweens for the rest of the
           session. */
        window.addEventListener("mousemove", function (e) {
            if (hintDone) return;
            cursor.x = e.clientX;
            cursor.y = e.clientY;
            cursor.known = true;
            if (followX) {
                placeHint(e.clientX, e.clientY);
            } else if (hintArmed) {
                startHint();
            }
        });

        /* Badge's top-left goes just past the pointer, then gets pulled back
           inside the viewport so it can't hang off an edge as the cursor
           reaches one. */
        function hintX(cx) {
            return Math.max(HINT_EDGE, Math.min(cx + HINT_OFFSET_X,
                window.innerWidth - hint.offsetWidth - HINT_EDGE));
        }

        function hintY(cy) {
            return Math.max(HINT_EDGE, Math.min(cy + HINT_OFFSET_Y,
                window.innerHeight - hint.offsetHeight - HINT_EDGE));
        }

        function placeHint(cx, cy) {
            followX(hintX(cx));
            followY(hintY(cy));
        }

        document.addEventListener("counter:arm-interaction", function () {
            hintArmed = true;
            /* Nowhere to put it if the pointer never moved — the listener
               above starts it on the first move instead. */
            if (cursor.known) startHint();
        }, { once: true });

        function startHint() {
            if (followX || hintDone) return;

            /* No xPercent/yPercent: x/y are the badge's top-left corner, which
               is what the offset above is measured from. */
            gsap.set(hint, { x: hintX(cursor.x), y: hintY(cursor.y) });

            /* quickTo retargets one tween per axis instead of spawning one per
               mousemove; the duration is what gives the badge its trailing lag. */
            followX = gsap.quickTo(hint, "x", { duration: 0.4, ease: "power3" });
            followY = gsap.quickTo(hint, "y", { duration: 0.4, ease: "power3" });

            gsap.timeline()
                .set(hint, { visibility: "visible" })
                .fromTo(hintLabel,
                    { scale: 0.4, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" })
                .fromTo(hintArrows,
                    { scale: 0, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.4,
                      ease: "back.out(2.5)", stagger: 0.05 }, "-=0.25")
                /* "Drag" is all four arrows; "Scroll" is only up and down, so
                   the side pair retract as the word changes. Their width and
                   margin go with them, not just their opacity — left in the
                   layout they'd hold open a gap either side of the pill. */
                .to(hintSides, {
                    scale: 0, opacity: 0, width: 0, marginLeft: 0, marginRight: 0,
                    duration: 0.38, ease: "power2.inOut"
                }, "+=" + HINT_DRAG_S)
                .to(hintLabel, { opacity: 0, y: -7, duration: 0.22, ease: "power2.in" }, "<")
                .call(function () { hintLabel.textContent = "Scroll"; })
                /* immediateRender:false is load-bearing. A fromTo renders its
                   "from" state the moment the timeline is built, so without it
                   this y:9 lands on the pill straight away and the whole "Drag"
                   state sits 9px below its own arrow row. */
                .fromTo(hintLabel,
                    { opacity: 0, y: 9 },
                    { opacity: 1, y: 0, duration: 0.3, ease: "power2.out",
                      immediateRender: false })
                .to(hint, { scale: 0.75, opacity: 0, duration: 0.4, ease: "power2.in" },
                    "+=" + HINT_SCROLL_S)
                .set(hint, { display: "none" })
                .call(function () { hintDone = true; });
        }
    }

    /* The mobile-only More group in the canvas menu. Same open/close shape as
       the footer's expand toggle, but driving a CSS grid track rather than an
       animated height, so it opens to the list's real size. */
    var moreGroup = document.getElementById("canvas-menu-more");
    var moreToggle = document.getElementById("canvas-menu-more-toggle");

    if (moreGroup && moreToggle) {
        moreToggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var open = !moreGroup.classList.contains("is-open");
            moreGroup.classList.toggle("is-open", open);
            moreToggle.setAttribute("aria-expanded", String(open));
        });
    }

    var expandToggle = document.getElementById("grid-expand-toggle");
    var extraLinks = document.getElementById("grid-extra-links");
    var extraOpen = false;

    if (expandToggle && extraLinks) {
        var extraLinkEls = extraLinks.querySelectorAll(".grid-extra-link");

        expandToggle.addEventListener("click", function () {
            extraOpen = !extraOpen;
            expandToggle.classList.toggle("is-open", extraOpen);
            expandToggle.setAttribute("aria-expanded", String(extraOpen));

            if (extraOpen) {
                gsap.set(extraLinks, { height: "auto", opacity: 1 });
                gsap.from(extraLinks, { height: 0, duration: 0.3, ease: "power2.out" });
                gsap.fromTo(extraLinkEls,
                    { opacity: 0, x: -14 },
                    { opacity: 0.5, x: 0, duration: 0.35, ease: "power3.out", stagger: 0.06, delay: 0.1 }
                );
            } else {
                gsap.to(extraLinkEls, {
                    opacity: 0,
                    x: -14,
                    duration: 0.2,
                    ease: "power2.in",
                    stagger: 0.04
                });
                gsap.to(extraLinks, {
                    height: 0,
                    opacity: 0,
                    duration: 0.3,
                    ease: "power2.in",
                    delay: 0.15
                });
            }
        });
    }

    var themeSwitch = document.getElementById("theme-switch");

    if (themeSwitch) {
        themeSwitch.addEventListener("click", function () {
            var isDark = document.body.classList.toggle("dark_theme");
            themeSwitch.setAttribute("aria-pressed", String(isDark));
        });
    }

    window.addEventListener("DOMContentLoaded", function () {
        playLoadingAnimation();
    });

})();
