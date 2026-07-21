/* ============================================
   COUNTER- CLT — MAIN JAVASCRIPT
   GSAP Loading Animation, Extra Links Toggle
   ============================================ */

(function () {
    "use strict";

    /* ---------- DOM REFERENCES ---------- */
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

    /* If the canvas never reports in at all (canvas-init failed to load / the
       manifest fetch threw, so no events ever arrive), finish the counter anyway
       after this long so the black loading screen can't strand the page. */
    const CANVAS_FALLBACK_MS = 18000;

    /* =============================================
       1. LOADING SEQUENCE
       -----------------------------------------
       PHASE 1 — on the black #loader curtain: logo + definition fade in, then the
       counter fades in at 0 and climbs to 93 over 2s. It holds there until the
       image pool has actually loaded, then finishes to 100.

       PHASE 2 — the reveal beats, in order:
         a) counter fades out; the loader box shrinks (w/h → 0) to nothing at
            centre while the logo eases to black; the images fade up behind it.
         b) the camera zooms forward through two chunks.
         c) the instant that lands, the overlay flips to difference blend and the
            logo snaps back to white (no transition); the site-grid chrome comes in.
       Canvas beats live in canvas-init.js; we bridge via CustomEvents.
       ============================================= */
    function playLoadingAnimation() {
        /* ---------- PHASE 1 — black curtain, logo + copy + counter ---------- */
        document.body.classList.add("intro");
        gsap.set([brandMark, siteGrid, canvasMenu], { opacity: 0 });
        gsap.set([definitionText, loadingCounter], { opacity: 0 });
        gsap.set(definitionPhonetic, { opacity: 0, y: 20 });

        const counterProxy = { v: 0 };
        function paintCounter() {
            if (loadingCounter) loadingCounter.textContent = Math.round(counterProxy.v);
        }
        paintCounter();

        /* The counter ramps to 93 on a fixed 2s tween, then only finishes to 100
           once the pool is really in — so 100 always means "loaded", and it's
           never revealed as instant even on a fast local load. */
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
        /* Backstop: never let a silent/failed canvas strand the counter at 93. */
        setTimeout(function () { loadDone = true; finishCounter(); }, CANVAS_FALLBACK_MS);

        /* Entrance: logo, copy, counter (at 0), then the 0→93 ramp. */
        gsap.timeline({ delay: 0.3 })
            .to(definitionPhonetic, { opacity: 1, y: 0, duration: 1.0, ease: "power3.out" })
            .to(definitionText, { opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.3")
            .to(loadingCounter, { opacity: 1, duration: 0.6, ease: "power2.out" }, "-=0.2")
            .to(counterProxy, {
                v: 93, duration: COUNT_RAMP_S, ease: "power1.out", onUpdate: paintCounter
            }, ">-0.1")
            .call(function () { reached93 = true; finishCounter(); });

        /* ---------- PHASE 2a — collapse the box, images up, logo to black ------ */
        function beginReveal() {
            const tl = gsap.timeline();

            tl.to(loadingCounter, { opacity: 0, duration: 0.4, ease: "power2.in" }, 0);

            /* Drop the intro palette — the logo eases from light to black. */
            tl.add(function () { document.body.classList.remove("intro"); }, 0);

            /* Beat 1: bring the images up behind the curtain (camera still). */
            tl.add(function () {
                document.__counterCanvasRequested = true;
                document.dispatchEvent(new CustomEvent("counter:reveal-canvas"));
            }, 0);

            /* Shrink the loader box to nothing at centre (width + height → 0). */
            gsap.set(loader, {
                left: "50%", top: "50%", xPercent: -50, yPercent: -50,
                width: "100vw", height: "100vh"
            });
            tl.to(loader, { width: 0, height: 0, duration: COLLAPSE_S, ease: "power2.inOut" }, 0.15);
            tl.set(loader, { display: "none" });

            /* Beat 2: once the box is gone, zoom through two chunks. */
            tl.add(function () {
                document.__counterCanvasZoom = true;
                document.dispatchEvent(new CustomEvent("counter:zoom-canvas"));
            });
        }

        /* ---------- PHASE 2c — zoom done: flip blend, bring chrome in ---------- */
        document.addEventListener("counter:canvas-shown", function () {
            /* Instant (no transition, per CSS): overlay → difference, logo → white. */
            document.body.classList.add("is-immersive");
            /* Drop the overlay into normal chrome stacking (below the menu). */
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

    /* =============================================
       2. EXTRA LINKS EXPAND TOGGLE
       ============================================= */
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

    /* =============================================
       3. LIGHT / DARK THEME SWITCH
       ============================================= */
    var themeSwitch = document.getElementById("theme-switch");

    if (themeSwitch) {
        themeSwitch.addEventListener("click", function () {
            var isDark = document.body.classList.toggle("dark_theme");
            themeSwitch.setAttribute("aria-pressed", String(isDark));
        });
    }

    /* =============================================
       4. INITIALISE ON DOM READY
       ============================================= */
    window.addEventListener("DOMContentLoaded", function () {
        playLoadingAnimation();
    });

})();
