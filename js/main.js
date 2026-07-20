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
    const mainContent = document.querySelector(".main-content");
    const brandMark = document.querySelector(".brand-mark");
    const siteGrid = document.getElementById("site-grid");

    /* =============================================
       1. LOADING ANIMATION
       ============================================= */
    function playLoadingAnimation() {
        document.body.classList.add("loading");

        const tl = gsap.timeline({ delay: 0.3 });

        /* Ensure phonetic starts hidden */
        gsap.set(definitionPhonetic, { opacity: 0, y: 20 });

        /* Step 1: definition-logo fades in */
        tl.to(definitionPhonetic, {
            opacity: 1,
            y: 0,
            duration: 1.0,
            ease: "power3.out"
        })
        .call(function () {
            document.body.classList.remove("loading");
        })
        /* Fade the loader out rather than tweening its colour — interpolating
           towards a hardcoded value tints the screen on the way out */
        .to(loader, {
            opacity: 0,
            duration: 0.8,
            ease: "power2.inOut"
        })
        /* Main content has no reveal-worthy hero anymore (the Websites view sits
           behind the Logos/Websites toggle), so just drop it in instead of
           running the multi-second clip-path animation */
        .set(mainContent, { clipPath: "inset(0 0 0 0)", opacity: 1 })
        .to({}, { duration: 0.2 })
        /* Pure opacity — any transform here reads as the copy jumping into place */
        .to(definitionText, {
            opacity: 1,
            duration: 0.9,
            ease: "power3.out"
        }, "-=0.1")
        /* Step 6: fade in UI chrome */
        .to(brandMark, {
            opacity: 1,
            duration: 0.8,
            ease: "power2.out"
        }, "-=0.3")
        .to(siteGrid, {
            opacity: 1,
            duration: 0.8,
            ease: "power2.out"
        }, "-=0.3")
        /* Step 8: drop the overlay out of its intro layer, hide loader */
        .call(function () {
            gsap.set(".hero-definition-overlay", { zIndex: 120 });
        })
        .set(loader, { display: "none" });
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
