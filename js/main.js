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
        gsap.set([brandMark, siteGrid, canvasMenu], { opacity: 0 });
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

    document.addEventListener("counter:filter-change", function (e) {
        var filtered = Boolean(e.detail && e.detail.filterId);

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

    document.addEventListener("counter:filter-swap", function (e) {
        var panel = panelFor(e.detail && e.detail.filterId);
        if (!panel) return;

        var side = (e.detail && e.detail.panelSide) || "left";
        panel.dataset.side = side;

        var from = { autoAlpha: 0 };
        if (side === "left") from.x = -22;
        else if (side === "right") from.x = 22;
        else if (side === "top") from.y = -22;
        else from.y = 22;

        gsap.fromTo(panel, from,
            { autoAlpha: 1, x: 0, y: 0, duration: 1.0, ease: "power3.out" });
    });

    
    var FOCUS_CHROME = [brandMark, siteGrid, canvasMenu, ".hero-definition-overlay"];

    document.addEventListener("counter:photo-focus", function (e) {
        var open = Boolean(e.detail && e.detail.focused);
        document.body.classList.toggle("photo-focus", open);
        gsap.to(FOCUS_CHROME, {
            opacity: open ? 0 : 1,
            duration: open ? 0.45 : 0.6,
            ease: "power2.out"
        });
    });


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
