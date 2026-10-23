/* ============================================
   COUNTER- CLT — MAIN.js
   ============================================ */
(function () {
    "use strict";

    const loader = document.getElementById("loader");
    const definitionPhonetic = document.querySelector(".definition-phonetic");
    const definitionText = document.querySelector(".definition-text:not(.tagline_text)");
    const loadingCounter = document.getElementById("loading-counter");
    const logoO = document.querySelector(".logo-o");
    const brandMark = document.querySelector(".brand-mark");
    const siteGrid = document.getElementById("site-grid");
    const canvasMenu = document.getElementById("canvas-menu");
    const COUNT_RAMP_S = 2.0;
    const COLLAPSE_S = 0.9;

    const CANVAS_FALLBACK_MS = 18000;

    function playLoadingAnimation() {

        document.body.classList.add("intro");
        gsap.set([brandMark, siteGrid, canvasMenu, ".pillars-tab"], { opacity: 0 });
        gsap.set([definitionText, loadingCounter], { opacity: 0 });
        gsap.set(definitionPhonetic, { opacity: 0, y: 20 });

        const counterProxy = { v: 0 };

        function placeLoadingCounterAtO() {
            if (!loadingCounter || !logoO) return;
            var r = logoO.getBoundingClientRect();
            loadingCounter.style.left = Math.round(r.left + r.width / 2) + "px";
            loadingCounter.style.top = Math.round(r.top + r.height / 2) + "px";
        }

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
            .call(placeLoadingCounterAtO, null, "-=0.2")
            .to(loadingCounter, { opacity: 1, duration: 0.6, ease: "power2.out" })
            .to(counterProxy, {
                v: 93, duration: COUNT_RAMP_S, ease: "power1.out", onUpdate: paintCounter
            }, "-=0.2")
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

    document.querySelectorAll(".filter-panel-tabs").forEach(function (group) {
        var tabs = Array.prototype.slice.call(group.querySelectorAll(".filter-panel-tab"));
        var panes = Array.prototype.slice.call(group.querySelectorAll(".filter-panel-tabpanel"));
        if (!tabs.length) return;

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

    var PARTNERS_CANVAS_DIM = 0.05;

    var partnersLink = document.getElementById("partners-display-link");
    var partnersPanel = document.getElementById("partners-panel");
    var partnersCloseBtn = document.getElementById("partners-close");
    var infiniteCanvas = document.getElementById("infinite-canvas");
    var partnersOpen = false;

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

            e.stopPropagation();
            setPartners(!partnersOpen);
        });

        if (partnersCloseBtn) {
            partnersCloseBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                setPartners(false);
            });
        }

        document.addEventListener("click", function (e) {
            if (!partnersOpen) return;
            if (partnersPanel.contains(e.target) || isPartnersToggle(e.target)) return;
            setPartners(false);
        }, true);

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") setPartners(false);
        });

        document.addEventListener("counter:filter-change", function () {
            setPartners(false);
        });

        window.addEventListener("resize", function () {
            if (!partnersOpen) return;
            partnersPanel.style.top =
                Math.round(definitionText.getBoundingClientRect().top) + "px";
        });
    }

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

                overwrite: "auto"
            });
        }
    }

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

        document.addEventListener("counter:arm-interaction", placePillarsTab, { once: true });

        pillarsTab.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            setPillars(!pillarsOpen);
        });

        document.addEventListener("click", function (e) {
            if (!pillarsOpen || pillarsTab.contains(e.target)) return;

            var selection = window.getSelection();
            if (pillarsGrid && pillarsGrid.contains(e.target) &&
                selection && selection.type === "Range" && String(selection).trim()) return;
            setPillars(false);
        }, true);

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && pillarsOpen) setPillars(false);
        });

        document.addEventListener("counter:filter-change", function (e) {
            setPillars(false);

            if (window.matchMedia(PILLARS_MOBILE_QUERY).matches) {
                var filtered = Boolean(e.detail && e.detail.filterId);
                pillarsTab.style.pointerEvents = filtered ? "none" : "";
                gsap.to(pillarsTab, {
                    opacity: filtered ? 0 : 1, duration: 0.5, ease: "power2.out"
                });
            }
        });
    }

    var LEGAL_CANVAS_DIM = 0.5;

    var LEGAL_MAX_SHIFT = 7;
    var LEGAL_MAX_SKEW = 1.4;

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

            legalWrapper.querySelectorAll(".legal-doc").forEach(function (el) {
                el.hidden = el !== doc;
            });

            legalScroll.scrollTop = 0;
            legalLastTop = 0;
            legalVel = 0;
            legalWrapper.style.setProperty("--legal-shift", "0px");
            legalWrapper.style.setProperty("--legal-skew", "0deg");

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

        legalWrapper.addEventListener("click", function () {
            var selection = window.getSelection();
            if (selection && selection.type === "Range" && String(selection).trim()) return;
            setLegal(null);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && legalOpen) setLegal(null);
        });
    }

    var HINT_DRAG_S = 1.8;
    var HINT_SCROLL_S = 1.8;

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

            if (cursor.known) startHint();
        }, { once: true });

        function startHint() {
            if (followX || hintDone) return;

            gsap.set(hint, { x: hintX(cursor.x), y: hintY(cursor.y) });

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

                .to(hintSides, {
                    scale: 0, opacity: 0, width: 0, marginLeft: 0, marginRight: 0,
                    duration: 0.38, ease: "power2.inOut"
                }, "+=" + HINT_DRAG_S)
                .to(hintLabel, { opacity: 0, y: -7, duration: 0.22, ease: "power2.in" }, "<")
                .call(function () { hintLabel.textContent = "Scroll"; })

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
