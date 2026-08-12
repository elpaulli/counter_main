/* ============================================
   SITE SWITCHER — SHARED ACROSS THE PROPERTIES
    Requires GSAP.
   ============================================ */

(function () {
    "use strict";

    const CURRENT_SITE = 'counter';

    const SITE_ASSETS = 'images/sites/';

    const TRIGGER = '.brand-mark';

    const STAGE = {
        inner:    '.hero-definition-overlay',
        mark:     '#definition-house',
        phonetic: '.definition-phonetic',
        logo:     '.definition-logo',
        tagline:  '.tagline_text',
        text:     '.definition-text:not(.tagline_text)'
    };

    const HIDE_ON_OPEN = [
        '#site-grid',
        '#canvas-menu',
        '#pillars-tab',
        '#canvas-focus-plus',
        '#loading-counter',
        '#cursor-hint'
    ];

    const OWN_CHROME = ['#infinite-canvas'];

    const DISMISS_FIRST = [
        { click: '#canvas-menu-toggle', when: '#canvas-menu.is-open', wait: 450 },
        { click: '#pillars-close', when: 'body.pillars-open', wait: 500 },
        { click: '#legal-close', when: 'body.legal-open', wait: 500 }
    ];

    const BUSY_CLASSES = ['loading', 'intro'];

    const SITES = [
        {
            id: 'spaghett',
            title: 'Spaghett',
            url: 'https://spaghett.paullindesign.com/',
            cta: 'Dai, si va da Spaghett!',

            badge: SITE_ASSETS + 'spaghett-hand.png',
            mark: SITE_ASSETS + 'spaghett-mark.png',
            logo: SITE_ASSETS + 'spaghett-logo.svg',
            tagline: 'Craft Pasta & Cocktail House',
            text: 'Located in Charlotte’s historic Fourth Ward, Spaghett is a neighborhood craft pasta and cocktail house from Irreverently Refined Hospitality.',

            bg: '#f5f2ed',
            fg: '#354000',
            accent: '#ff6d00',

            frame: {
                tile: SITE_ASSETS + 'spaghett-border.svg',
                corner: SITE_ASSETS + 'spaghett-border-corner.svg',
                w: 19,
                aspect: 37.44 / 19
            },
            fontSans: '"acumin-pro-wide", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontDisplay: '"roca", Georgia, serif',
            fontItalic: '"roca", Georgia, serif'
        },
        {
            id: 'counter',
            title: 'Counter-',
            url: 'https://counter.paullindesign.com/',
            cta: 'Travel to Counter',

            badge: SITE_ASSETS + 'counter-dash.png',
            mark: '',
            logo: SITE_ASSETS + 'counter-logo.svg',
            tagline: '',
            text: 'coun·ter /ˈkoun(t)ər/ — contrary to intuition or to common-sense expectation but often nevertheless true.',

            bg: '#f8f2e6',
            fg: '#212121',
            accent: '#f4451e',
            bgImage: SITE_ASSETS + 'counter-bg.jpg',
            bgVeil: 0.2,

            fontSans: '"Pitch-Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontDisplay: '"Doner-Bold", Georgia, serif',
            fontItalic: '"Doner-Bold", Georgia, serif'
        },
        {
            id: 'okeyo',
            title: 'oKEYo',
            url: 'https://okeyo.paullindesign.com/',
            cta: 'Unlock oKEYo',

            badge: SITE_ASSETS + 'okeyo-mark.svg',
            mark: '',
            logo: SITE_ASSETS + 'oKEYo-logo-03.svg',
            tagline: '',
            text: 'occhiolism (oh-kyoh-liz-uhm): the awareness of how funamentally limited your senese are which makes you wish you could experience the whole of reality instead of only ever catching a tiny glimpse of it, to just once step back from the keyhole and finally open the door.',

            bg: '#0a0a0a',
            fg: '#fff5ca',
            accent: '#246996',
            bgImage: SITE_ASSETS + 'okeyo-bg.jpg',
            bgVeil: 0.3,

            fontSans: '"Quablo", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontDisplay: '"Roma", "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontItalic: '"Quablo", "Helvetica Neue", Helvetica, Arial, sans-serif'
        }
    ];

    const STAY_LABEL = 'Stay Here';
    const SOON_HINT = 'coming soon';
    const NOTE_TEXT = 'Discover the rest of our family';
    const travelLabel = (site) => site.cta || 'Travel to ' + site.title;
    const stayLabel = (site) => site.stay || STAY_LABEL;

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const S = (seconds) => (REDUCED ? 0.001 : seconds);

    const PANEL_IN_S = S(0.5);
    const PANEL_OUT_S = S(0.3);
    const CHROME_FADE_S = S(0.45);
    const SWAP_OUT_S = S(0.34);
    const SWAP_IN_S = S(0.62);

    const SWAP_DROP = 34;
    const SWAP_STEP = REDUCED ? 0 : 0.06;

    const LOGO_OUT_S = 1.0;
    const LOGO_OUT_STAGGER = 0.3;
    const LOGO_IN_S = 1.5;
    const LOGO_IN_STAGGER = 0.4;
    const LOGO_BLUR_PX = 12;
    const LOGO_SCALE_END = 0.5;
    const LOGO_SCALE_MID = 2.1;
    const LOGO_MAX_H = 130;
    const LOGO_HANDOFF_S = 0.55;
    const EXCHANGE_AT = Math.max(SWAP_OUT_S, LOGO_OUT_S);
    const SWAP_TOTAL_S = EXCHANGE_AT + Math.max(SWAP_IN_S, LOGO_IN_S);
    const DEFAULT_BG_VEIL = 0.3;

    const BADGE_TURN_DEG = 360 / SITES.length;
    const BADGE_SPIN_S = S(0.72);
    const BADGE_SPIN_AT = 0.1;
    const BADGE_EASE = 'back.out(1.1)';

    const EXIT_S = S(0.5);
    const EXIT_COLOR = '#f5f2ed';

    const HINT_FOLLOW_S = S(0.35);

    const NAV_TEXT_IN_S = 0.9;
    const NAV_TEXT_IN_STAGGER = 0.05;
    const NAV_TEXT_OUT_S = 0.5;
    const NAV_TEXT_OUT_STAGGER = 0.03;

    const POINTER_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 901px)';
    const mqPointer = window.matchMedia(POINTER_QUERY);
    const onPointerDevice = () => mqPointer.matches;

    const mqPhone = window.matchMedia('(max-width: 900px)');
    const CENTRE_S = S(0.7);
    const STAGE_TOP_MIN = 104;

    const WHEEL_THRESHOLD = 60;
    const WHEEL_COOLDOWN_MS = 260;
    const SWIPE_THRESHOLD = 34;

    const SWAP_SETTLE_MS = 140;


    if (!window.gsap) {
        console.warn('[site-switcher] GSAP not found — switcher not started.');
        return;
    }

    const currentIndex = Math.max(0, SITES.findIndex((s) => s.id === CURRENT_SITE));
    if (SITES.length < 2) return;

    const trigger = document.querySelector(TRIGGER);
    const stageInner = document.querySelector(STAGE.inner);
    const hostMark = document.querySelector(STAGE.mark);
    const hostPhonetic = document.querySelector(STAGE.phonetic);
    const hostLogo = document.querySelector(STAGE.logo);
    const hostTagline = document.querySelector(STAGE.tagline);
    const hostText = document.querySelector(STAGE.text);

    if (!trigger || !stageInner || !hostText) {
        console.warn('[site-switcher] page is missing the trigger or the definition — switcher not started.');
        return;
    }

    function classOf(el) {
        if (!el) return '';
        return typeof el.className === 'string'
            ? el.className
            : (el.getAttribute('class') || '');
    }

    function channels(hex) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        const n = parseInt(full, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    const rgbList = (hex) => channels(hex).join(', ');
    const rgba = (hex, a) => 'rgba(' + rgbList(hex) + ', ' + a + ')';

    const PALETTE_PROPS = ['--bg', '--bg-rgb', '--fg', '--fg-70', '--fg-30', '--fg-20', '--accentColor'];

    const FONT_PROPS = {
        fontSans: '--font-sans',
        fontDisplay: '--font-display',
        fontItalic: '--font-italic'
    };

    function applyPalette(site) {
        const s = document.documentElement.style;
        s.setProperty('--bg', site.bg);
        s.setProperty('--bg-rgb', rgbList(site.bg));
        s.setProperty('--fg', site.fg);
        s.setProperty('--fg-70', rgba(site.fg, 0.7));
        s.setProperty('--fg-30', rgba(site.fg, 0.3));
        s.setProperty('--fg-20', rgba(site.fg, 0.2));
        s.setProperty('--accentColor', site.accent);

        Object.keys(FONT_PROPS).forEach((key) => {
            if (site[key]) s.setProperty(FONT_PROPS[key], site[key]);
            else s.removeProperty(FONT_PROPS[key]);
        });
    }

    const FONT_BLUR_PX = 7;
    const FONT_BLUR_S = 0.5;

    function firstFamily(stack) {
        if (!stack) return '';
        return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    }

    function familiesOf(site) {
        const names = [site.fontSans, site.fontDisplay, site.fontItalic]
            .map(firstFamily)
            .filter(Boolean);
        return Array.from(new Set(names));
    }

    function facesReady(site) {
        const names = familiesOf(site);
        if (!names.length || !document.fonts) return Promise.resolve();
        return Promise.all(names.map(
            (name) => document.fonts.load('1em "' + name + '"').catch(() => null)
        ));
    }

    let focusToken = 0;

    function focusText(site, targets) {
        if (!targets.length) return;
        const token = ++focusToken;

        gsap.killTweensOf(targets, 'filter');
        gsap.set(targets, { filter: 'blur(' + FONT_BLUR_PX + 'px)' });

        facesReady(site).then(() => {
            if (token !== focusToken) return;
            gsap.to(targets, {
                filter: 'blur(0px)',
                duration: S(FONT_BLUR_S),
                ease: 'power2.out',
                onComplete: () => gsap.set(targets, { clearProps: 'filter' })
            });
        });
    }

    function clearPalette() {
        const s = document.documentElement.style;
        PALETTE_PROPS.forEach((p) => s.removeProperty(p));
        Object.keys(FONT_PROPS).forEach((key) => s.removeProperty(FONT_PROPS[key]));
    }


    const svgPending = Object.create(null);
    const svgReady = Object.create(null);

    function loadSvg(src) {
        if (!src || !/\.svg(\?|$)/i.test(src)) return Promise.resolve(null);
        if (svgPending[src]) return svgPending[src];

        svgPending[src] = fetch(src)
            .then((res) => (res.ok ? res.text() : Promise.reject(new Error(res.status))))
            .then((text) => {
                const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
                if (doc.querySelector('parsererror')) throw new Error('unparsable');
                const svg = doc.querySelector('svg');
                if (!svg) throw new Error('no svg');
                svgReady[src] = svg;
                return svg;
            })
            .catch(() => null);

        return svgPending[src];
    }

    function preload() {
        SITES.forEach((site) => {
            const frame = site.frame || {};
            [site.badge, site.mark, site.logo, site.bgImage, frame.tile, frame.corner]
                .forEach((src) => {
                    if (src) new Image().src = src;
                });
            loadSvg(site.logo);
            loadSvg(site.badge);
            facesReady(site);
        });
    }


    let root = null;
    let rows = [];
    let cta = null;
    let backdrop = null;
    let frameEl = null;
    let hint = null;
    let note = null;
    let navEl = null;
    let hintToX = null;
    let hintToY = null;
    let injMark = null;
    let injLogo = null;
    let injTagline = null;
    let injText = null;
    let chamber = null;
    let hostSlot = null;
    let swapSlots = [];
    let badgeSlot = null;
    let badgeTl = null;
    let closeRing = null;

    function build() {
        backdrop = document.createElement('div');
        backdrop.className = 'switcher-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);
        frameEl = buildFrame();
        document.body.appendChild(frameEl);

        root = document.createElement('div');
        root.className = 'site-switcher';
        root.id = 'site-switcher';
        root.hidden = true;
        root.setAttribute('data-lenis-prevent', '');

        const nav = document.createElement('div');
        navEl = nav;
        nav.className = 'switcher-nav';
        nav.setAttribute('role', 'listbox');
        nav.setAttribute('aria-label', 'Our properties');
        nav.setAttribute('aria-orientation', 'vertical');

        SITES.forEach((site, i) => nav.appendChild(navItem(site, i)));
        rows = Array.prototype.slice.call(nav.children);

        const foot = document.createElement('div');
        foot.className = 'switcher-foot';

        cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'switcher-label switcher-cta';
        cta.id = 'switcher-cta';
        foot.appendChild(cta);
        hint = document.createElement('div');
        hint.className = 'switcher-label switcher-hint';
        hint.setAttribute('aria-hidden', 'true');

        note = document.createElement('p');
        note.className = 'switcher-note';
        note.textContent = NOTE_TEXT;

        root.appendChild(nav);
        root.appendChild(foot);
        root.appendChild(note);
        root.appendChild(hint);
        document.body.appendChild(root);

        gsap.set(hint, { xPercent: -50, yPercent: -50, scale: 0.9 });
        hintToX = gsap.quickTo(hint, 'x', { duration: HINT_FOLLOW_S, ease: 'power3' });
        hintToY = gsap.quickTo(hint, 'y', { duration: HINT_FOLLOW_S, ease: 'power3' });

        buildStage();
        buildChamber();
        wire();
    }

    function navItem(site, i) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'switcher-nav-item';
        btn.dataset.site = String(i);
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('aria-label', site.title);

        const icon = document.createElement('span');
        icon.className = 'switcher-nav-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(Object.assign(document.createElement('span'),
            { className: 'switcher-nav-core' }));

        const title = document.createElement('span');
        title.className = 'switcher-nav-title';
        title.setAttribute('aria-hidden', 'true');
        splitChars(title, site.title);
        gsap.set(title, { perspective: 1000 });

        btn.appendChild(icon);
        btn.appendChild(title);
        return btn;
    }

    function splitChars(el, text) {
        el.textContent = '';
        Array.from(text).forEach((ch) => {
            const span = document.createElement('span');
            span.className = 'switcher-char';
            span.textContent = ch === ' ' ? ' ' : ch;
            el.appendChild(span);
        });
    }

    const charsOf = (row) => row.querySelectorAll('.switcher-char');

    const OFF = 'switcher-off';
    const FRAME_RUNS = ['top', 'right', 'bottom', 'left'];
    const FRAME_CORNERS = ['tl', 'tr', 'br', 'bl'];

    function buildFrame() {
        const el = document.createElement('div');
        el.className = 'switcher-frame ' + OFF;
        el.setAttribute('aria-hidden', 'true');

        FRAME_RUNS.forEach((side) => {
            const run = document.createElement('span');
            run.className = 'switcher-frame-run switcher-frame-' + side;
            el.appendChild(run);
        });

        FRAME_CORNERS.forEach((corner) => {
            const dot = document.createElement('span');
            dot.className = 'switcher-frame-corner switcher-frame-corner-' + corner;
            el.appendChild(dot);
        });

        return el;
    }

    function buildStage() {
        if (hostMark) {
            injMark = document.createElement('img');
            injMark.className = classOf(hostMark) + ' switcher-mark ' + OFF;
            injMark.alt = '';
            injMark.decoding = 'async';
            injMark.addEventListener('error', () => injMark.classList.add(OFF));
            hostMark.parentNode.insertBefore(injMark, hostMark);
        }

        if (hostLogo && hostPhonetic) {
            injLogo = document.createElement('span');
            injLogo.className = classOf(hostLogo) + ' switcher-logo ' + OFF;
            injLogo.setAttribute('role', 'img');
            hostPhonetic.appendChild(injLogo);
        }

        injText = document.createElement('p');
        injText.className = classOf(hostText) + ' switcher-text ' + OFF;
        hostText.parentNode.insertBefore(injText, hostText.nextSibling);

        injTagline = document.createElement('p');
        injTagline.className = classOf(hostTagline || hostText) + ' switcher-tagline ' + OFF;
        if (hostTagline) hostTagline.parentNode.insertBefore(injTagline, hostTagline.nextSibling);
        else injText.parentNode.insertBefore(injTagline, injText);
    }


    function buildChamber() {
        chamber = document.createElement('span');
        chamber.className = 'switcher-chamber';

        hostSlot = document.createElement('span');
        hostSlot.className = 'switcher-chamber-slot switcher-chamber-host';
        while (trigger.firstChild) hostSlot.appendChild(trigger.firstChild);
        chamber.appendChild(hostSlot);

        swapSlots = [0, 1].map(() => {
            const slot = document.createElement('span');
            slot.className = 'switcher-chamber-slot switcher-chamber-swap ' + OFF;
            slot.setAttribute('aria-hidden', 'true');
            chamber.appendChild(slot);
            return slot;
        });

        trigger.appendChild(chamber);
        badgeSlot = hostSlot;

        closeRing = document.createElement('span');
        closeRing.className = 'switcher-close';
        closeRing.setAttribute('aria-hidden', 'true');
        trigger.appendChild(closeRing);
    }

    function badgeSvg(svg) {
        const node = svg.cloneNode(true);
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('focusable', 'false');
        return node;
    }

    function renderBadge(slot, site) {
        const src = site.badge || '';
        slot.dataset.badge = src;
        slot.innerHTML = '';
        slot.classList.toggle(OFF, !src);
        if (!src) return;

        const ready = svgReady[src];
        if (ready) {
            slot.appendChild(badgeSvg(ready));
            return;
        }

        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.addEventListener('error', () => slot.classList.add(OFF));
        img.src = src;
        slot.appendChild(img);

        loadSvg(src).then((late) => {
            if (!late || slot.dataset.badge !== src) return;
            slot.innerHTML = '';
            slot.appendChild(badgeSvg(late));
        });
    }

    const freeSlot = () => (swapSlots[0] === badgeSlot ? swapSlots[1] : swapSlots[0]);

    function chamberTurn(from, to) {
        const n = SITES.length;
        if (from < 0 || to < 0) return BADGE_TURN_DEG;

        const fwd = (((to - from) % n) + n) % n;
        const back = (((from - to) % n) + n) % n;
        return fwd <= back ? BADGE_TURN_DEG * fwd : -BADGE_TURN_DEG * back;
    }

    function turnChamber(site, toHost, turn) {
        if (!chamber || !badgeSlot) return;

        const from = badgeSlot;
        const into = toHost ? hostSlot : freeSlot();
        if (!into || into === from) return;

        if (toHost) into.classList.remove(OFF);
        else renderBadge(into, site);
        badgeSlot = into;

        if (badgeTl) badgeTl.kill();
        badgeTl = gsap.timeline();
        badgeTl
            .to(from, {
                rotation: turn,
                duration: BADGE_SPIN_S,
                ease: BADGE_EASE
            }, 0)
            .to(from, {
                autoAlpha: 0,
                duration: BADGE_SPIN_S * 0.4,
                ease: 'power1.in'
            }, BADGE_SPIN_S * 0.55)
            .fromTo(into,
                { rotation: -turn, autoAlpha: 0 },
                { rotation: 0, duration: BADGE_SPIN_S, ease: BADGE_EASE },
                0)
            .to(into, {
                autoAlpha: 1,
                duration: BADGE_SPIN_S * 0.35,
                ease: 'power1.out'
            }, BADGE_SPIN_S * 0.1);
    }

    function resetChamber() {
        if (!chamber) return;

        if (badgeTl) { badgeTl.kill(); badgeTl = null; }
        gsap.killTweensOf([hostSlot].concat(swapSlots));
        gsap.set(hostSlot, { clearProps: 'all' });

        swapSlots.forEach((slot) => {
            gsap.set(slot, { clearProps: 'all' });
            slot.classList.add(OFF);
            slot.innerHTML = '';
            slot.dataset.badge = '';
        });

        badgeSlot = hostSlot;
    }

    function stageExtent() {
        let top = Infinity;
        let bottom = -Infinity;

        Array.prototype.forEach.call(stageInner.children, (el) => {
            if (el.offsetParent === null || el.hasAttribute('data-switcher-hidden')) return;
            const r = el.getBoundingClientRect();
            if (!r.height) return;
            const dy = gsap.getProperty(el, 'y') || 0;
            top = Math.min(top, r.top - dy);
            bottom = Math.max(bottom, r.bottom - dy);
        });

        if (top === Infinity) {
            const box = stageInner.getBoundingClientRect();
            return { top: box.top, height: box.height };
        }
        return { top: top, height: bottom - top };
    }

    function centreOffset() {
        const seen = stageExtent();
        const rest = seen.top - (gsap.getProperty(stageInner, 'y') || 0);
        const want = Math.max((window.innerHeight - seen.height) / 2, STAGE_TOP_MIN);
        return want - rest;
    }

    function centreStage(on) {
        if (!stageInner) return;

        const to = on && mqPhone.matches ? centreOffset() : 0;
        gsap.to(stageInner, {
            y: to,
            duration: CENTRE_S,
            ease: 'power3.inOut',
            overwrite: 'auto',
            onComplete: () => {
                if (!to) gsap.set(stageInner, { clearProps: 'transform' });
            }
        });
    }


    const hostParts = () => [hostMark, hostTagline, hostText].filter(Boolean);
    const injParts = () => [injMark, injTagline, injText].filter(Boolean);

    function copyOnStage(toHost) {
        if (toHost) return [hostTagline, hostText].filter(Boolean);
        return [injTagline, injText, injLogo]
            .filter((el) => el && !el.classList.contains(OFF) &&
                            (el !== injLogo || el.classList.contains('is-text')));
    }

    function showHost(on) {
        hostParts().forEach((el) => el.classList.toggle(OFF, !on));
    }

    function showInjected(on, site) {
        if (!on) {
            injParts().forEach((el) => el.classList.add(OFF));
            return;
        }
        renderInjected(site);
    }

    function renderInjected(site) {
        if (injMark) {
            if (site.mark) {
                if (injMark.getAttribute('src') !== site.mark) injMark.src = site.mark;
                injMark.classList.remove(OFF);
            } else {
                injMark.classList.add(OFF);
            }
        }

        if (injTagline) {
            injTagline.textContent = site.tagline || '';
            injTagline.classList.toggle(OFF, !site.tagline);
        }

        if (injText) {
            injText.textContent = site.text || '';
            injText.classList.remove(OFF);
        }
    }


    const LETTER_SHAPES = 'path, polygon, polyline, circle, ellipse, rect, line';

    function drawablesIn(node) {
        return Array.prototype.filter.call(node.children, (el) => (
            el.tagName.toLowerCase() === 'g'
                ? !!el.querySelector(LETTER_SHAPES)
                : el.matches(LETTER_SHAPES)
        ));
    }

    function lettersOf(box) {
        const svg = box.querySelector('svg');
        if (!svg) return [];
        if (svg.__letters) return svg.__letters;

        let node = svg;
        let units = drawablesIn(node);
        while (units.length === 1 && units[0].tagName.toLowerCase() === 'g') {
            node = units[0];
            units = drawablesIn(node);
        }
        if (!units.length) return [];

        try {
            const placed = units.map((el) => {
                const box = el.getBBox();
                return { el: el, mid: box.x + box.width / 2 };
            });
            if (placed.some((u) => u.mid)) {
                const ordered = placed.sort((a, b) => a.mid - b.mid).map((u) => u.el);
                svg.__letters = ordered;
                return ordered;
            }
        } catch (e) { /* not laid out — fall through */ }

        return units;
    }

    function centreOrigins(units) {
        const plain = [];
        units.forEach((u) => {
            if (typeof u.getBBox !== 'function') { plain.push(u); return; }
            try {
                const b = u.getBBox();
                if (!b.width && !b.height) { plain.push(u); return; }
                gsap.set(u, {
                    svgOrigin: (b.x + b.width / 2) + ' ' + (b.y + b.height / 2)
                });
            } catch (e) {
                plain.push(u);
            }
        });

        if (plain.length) gsap.set(plain, { transformOrigin: '50% 50%' });
    }

    function wordUnits(box) {
        const letters = lettersOf(box);
        if (letters.length) return letters;
        return [box.querySelector('svg') || box.firstElementChild || box].filter(Boolean);
    }

    function reach(i, total) {
        const half = Math.ceil(total / 2);
        return i < half ? i : half - Math.abs(Math.floor(total / 2) - i) - 1;
    }

    function logoIn(box) {
        if (!box) return;
        const units = wordUnits(box);
        if (!units.length) return;

        const total = units.length;
        const half = Math.ceil(total / 2);
        const at = (from, to, i) => gsap.utils.mapRange(0, half, from, to, reach(i, total));
        const spread = REDUCED ? 0 : LOGO_IN_STAGGER;

        gsap.killTweensOf(units);
        centreOrigins(units);
        gsap.fromTo(units, {
            willChange: 'transform, filter',
            scale: (i) => at(LOGO_SCALE_END, LOGO_SCALE_MID, i),
            filter: 'blur(' + LOGO_BLUR_PX + 'px) opacity(0)'
        }, {
            ease: 'power2.inOut',
            scale: 1,
            filter: 'blur(0px) opacity(1)',
            duration: S(LOGO_IN_S) - spread,
            stagger: { amount: spread, from: 'center' },
            onComplete: () => gsap.set(units, { willChange: 'auto' })
        });
    }

    function logoOut(box) {
        if (!box) return;
        const units = wordUnits(box);
        if (!units.length) return;
        const spread = REDUCED ? 0 : LOGO_OUT_STAGGER;

        gsap.killTweensOf(units);
        centreOrigins(units);
        gsap.to(units, {
            willChange: 'transform, filter',
            scale: LOGO_SCALE_END,
            filter: 'blur(' + LOGO_BLUR_PX + 'px) opacity(0)',
            ease: 'power2.inOut',
            duration: S(LOGO_OUT_S) - spread,
            stagger: { amount: spread, from: 'edges' }
        });
    }

    function renderLogo(site) {
        if (!injLogo) return;

        injLogo.innerHTML = '';
        injLogo.classList.remove('is-text');
        injLogo.setAttribute('aria-label', site.title);
        gsap.set(injLogo, { clearProps: 'transform', scale: site.logoScale || 1 });

        const svg = site.logo ? svgReady[site.logo] : null;
        if (svg) {
            const node = svg.cloneNode(true);
            node.setAttribute('aria-hidden', 'true');
            node.setAttribute('focusable', 'false');

            const vb = (node.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
            if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
                const h = Math.min(LOGO_MAX_H, vb[3]);
                injLogo.dataset.restWidth = String(h * vb[2] / vb[3]);
                node.style.width = 'min(100%, ' + injLogo.dataset.restWidth + 'px)';
                node.style.height = 'auto';
            }

            injLogo.appendChild(node);

            void injLogo.offsetWidth;
            return;
        }

        if (site.logo) {
            const img = document.createElement('img');
            img.alt = '';
            img.addEventListener('error', () => {
                injLogo.innerHTML = '';
                injLogo.classList.add('is-text');
                injLogo.textContent = site.title;
            });
            img.src = site.logo;
            injLogo.appendChild(img);
            return;
        }

        injLogo.classList.add('is-text');
        injLogo.textContent = site.title;
    }


    function sizeLogo(fromWidth, toWidth, done) {
        const node = injLogo && injLogo.firstElementChild;
        if (!node || !fromWidth || !toWidth || Math.abs(toWidth - fromWidth) < 2) {
            if (done) done();
            return;
        }

        gsap.fromTo(node,
            { width: fromWidth },
            {
                width: toWidth,
                duration: S(LOGO_HANDOFF_S),
                ease: 'power2.inOut',
                onComplete: () => {
                    node.style.width = 'min(100%, ' + toWidth + 'px)';
                    if (done) done();
                }
            }
        );
    }

    let pageLogoWidth = 0;


    let selected = currentIndex;

    function markActive() {
        rows.forEach((el, i) => {
            const on = i === selected;
            el.classList.toggle('is-active', on);
            el.setAttribute('aria-selected', String(on));
            el.tabIndex = on ? 0 : -1;
        });
        refreshTitles();
    }


    let hoveredRow = null;

    function stagger(per, count, budget) {
        return Math.min(per * Math.max(count - 1, 0), budget * 0.45);
    }

    function charsIn(row) {
        const chars = charsOf(row);
        if (!chars.length) return;

        const spread = REDUCED ? 0 : stagger(NAV_TEXT_IN_STAGGER, chars.length, NAV_TEXT_IN_S);

        gsap.killTweensOf(chars);
        gsap.fromTo(chars, {
            willChange: 'opacity, transform',
            transformOrigin: '50% 0%',
            opacity: 0,
            rotationX: -90,
            z: -200
        }, {
            opacity: 1,
            rotationX: 0,
            z: 0,
            ease: 'power1',
            duration: S(NAV_TEXT_IN_S) - spread,
            stagger: { amount: spread },
            onComplete: () => gsap.set(chars, { willChange: 'auto' })
        });
    }

    function charsOut(row) {
        const chars = charsOf(row);
        if (!chars.length) return;

        const spread = REDUCED ? 0 : stagger(NAV_TEXT_OUT_STAGGER, chars.length, NAV_TEXT_OUT_S);

        gsap.killTweensOf(chars);
        gsap.to(chars, {
            willChange: 'opacity, transform',
            transformOrigin: '50% 100%',
            opacity: 0,
            rotationX: 90,
            z: 0,
            ease: 'power4.in',
            duration: S(NAV_TEXT_OUT_S) - spread,
            stagger: { each: spread / Math.max(chars.length - 1, 1), from: 'random' },
            onComplete: () => gsap.set(chars, { willChange: 'auto' })
        });
    }

    function refreshTitles() {
        rows.forEach((row) => {
            const want = row.classList.contains('is-active') || row === hoveredRow;
            if (want === (row.dataset.titleOn === '1')) return;
            row.dataset.titleOn = want ? '1' : '0';
            if (want) charsIn(row);
            else charsOut(row);
        });
    }

    function resetTitles() {
        rows.forEach((row) => {
            row.dataset.titleOn = '0';
            gsap.killTweensOf(charsOf(row));
            gsap.set(charsOf(row), { opacity: 0, rotationX: -90, z: -200 });
        });
        hoveredRow = null;
    }

    function goTo(index) {
        const n = SITES.length;
        const next = ((index % n) + n) % n;
        if (next === selected) return;

        selected = next;
        markActive();
        setSite(next);
    }

    const step = (dir) => goTo(selected + dir);

    let swapTimer = null;
    let swapTl = null;
    let rendered = CURRENT_SITE;

    function setSite(index) {
        clearTimeout(swapTimer);
        swapTimer = setTimeout(() => swapDefinition(SITES[index]), SWAP_SETTLE_MS);
    }

    function setControls(site) {
        if (!cta) return;

        const staying = site.id === CURRENT_SITE;
        const soon = !staying && !site.url;
        const label = staying ? stayLabel(site) : travelLabel(site);

        cta.textContent = label;
        cta.disabled = soon;
        cta.setAttribute('aria-label', soon
            ? label + ' — ' + SOON_HINT
            : (staying ? label : label + ' — opens ' + site.url));

        if (hint) hint.textContent = label;

        [cta, hint].forEach((el) => {
            if (!el) return;
            el.classList.toggle('is-stay', staying);
        });
        if (hint) hint.classList.toggle('is-glass', soon);

        setHint(onPointerDevice());
    }

    function paintBackdrop(site) {
        if (!backdrop) return;
        const src = site.bgImage || '';
        backdrop.style.backgroundImage = src ? 'url("' + src + '")' : 'none';
        backdrop.style.setProperty('--switcher-bg-veil',
            String(!src ? 0 : (site.bgVeil == null ? DEFAULT_BG_VEIL : site.bgVeil)));
    }

    function paintFrame(site) {
        if (!frameEl) return;

        const f = site.frame;
        frameEl.classList.toggle(OFF, !f);
        if (!f) return;

        const s = frameEl.style;
        s.setProperty('--switcher-frame-w', f.w + 'px');
        s.setProperty('--switcher-frame-tile', (f.w * f.aspect) + 'px');
        s.setProperty('--switcher-frame-src', 'url("' + f.tile + '")');
        s.setProperty('--switcher-frame-corner-src', 'url("' + f.corner + '")');
    }

    const ground = () => [backdrop, frameEl].filter(Boolean);

    function swapDefinition(site) {
        if (site.id === rendered) return;

        const prev = SITES.find((s) => s.id === rendered) || null;
        const turn = chamberTurn(SITES.indexOf(prev), SITES.indexOf(site));
        const fromHost = rendered === CURRENT_SITE;
        const toHost = site.id === CURRENT_SITE;
        const out = fromHost ? hostParts() : injParts();
        const into = toHost ? hostParts() : injParts();
        const groundOut = !fromHost;
        const groundIn = !toHost;
        rendered = site.id;

        if (swapTl) swapTl.kill();
        swapTl = gsap.timeline();
        swapTl.to(out, {
            y: SWAP_DROP,
            opacity: 0,
            duration: SWAP_OUT_S,
            ease: 'power2.in',
            stagger: SWAP_STEP
        }, 0);

        const controls = [cta, hint, note].filter(Boolean);
        if (controls.length) {
            swapTl.to(controls, { opacity: 0, duration: SWAP_OUT_S, ease: 'power2.in' }, 0);
        }

        swapTl.add(() => turnChamber(site, toHost, turn), BADGE_SPIN_AT);

        if (groundOut) {
            swapTl.to(ground(), { autoAlpha: 0, duration: SWAP_OUT_S, ease: 'power2.in' }, 0);
        }

        if (injLogo) logoOut(injLogo);

        swapTl.add(() => {
            if (toHost) {
                showInjected(false);
                showHost(true);
            } else {
                showHost(false);
                showInjected(true, site);
            }
            applyPalette(site);
            paintBackdrop(site);
            paintFrame(site);
            setControls(site);
            muteOwnChrome(!toHost);
            document.body.dataset.switcherSite = site.id;

            focusText(site, copyOnStage(toHost));
            renderLogo(site);
            logoIn(injLogo);
            centreStage(true);
        }, EXCHANGE_AT);

        swapTl.fromTo(into,
            { y: SWAP_DROP, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: SWAP_IN_S,
                ease: 'power3.out',
                stagger: SWAP_STEP * 2
            },
            EXCHANGE_AT
        );

        if (controls.length) {
            swapTl.to(controls, { opacity: 1, duration: SWAP_IN_S, ease: 'power2.out' }, EXCHANGE_AT);
        }
        if (groundIn) {
            swapTl.to(ground(), { autoAlpha: 1, duration: SWAP_IN_S, ease: 'power2.out' }, EXCHANGE_AT);
        }
    }

    const parked = new Map();

    function park(selectors, flag) {
        const els = [];
        selectors.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                if (parked.has(el)) return;
                parked.set(el, { flag: flag, opacity: gsap.getProperty(el, 'opacity') });
                el.setAttribute(flag, '');
                els.push(el);
            });
        });
        return els;
    }

    function unpark(flag) {
        const back = [];
        parked.forEach((state, el) => {
            if (flag && state.flag !== flag) return;
            el.removeAttribute(state.flag);
            back.push({ el: el, opacity: state.opacity });
        });
        back.forEach(({ el }) => parked.delete(el));
        return back;
    }

    let muted = false;

    function muteOwnChrome(on) {
        if (on === muted) return;
        muted = on;

        if (on) {
            const els = park(OWN_CHROME, 'data-switcher-muted');
            if (els.length) {
                gsap.to(els, { opacity: 0, duration: CHROME_FADE_S, ease: 'power2.out' });
            }
        } else {
            unpark('data-switcher-muted').forEach(({ el, opacity }) => {
                gsap.to(el, { opacity: opacity, duration: CHROME_FADE_S, ease: 'power2.out' });
            });
        }
    }

    let open = false;
    let busy = false;

    function openSwitcher() {
        if (open || busy) return;
        if (BUSY_CLASSES.some((c) => document.body.classList.contains(c))) return;

        /* Anything already holding the screen gets closed by its own control
           first, so it unwinds the way it knows how rather than being hidden
           mid-animation and left in a state it cannot get out of. */
        for (let i = 0; i < DISMISS_FIRST.length; i++) {
            const panel = DISMISS_FIRST[i];
            const control = document.querySelector(panel.click);
            if (!control || !document.querySelector(panel.when)) continue;

            busy = true;
            control.click();
            setTimeout(() => { busy = false; openSwitcher(); }, panel.wait);
            return;
        }

        if (!root) build();

        open = true;
        document.body.classList.add('switcher-open');
        trigger.setAttribute('aria-expanded', 'true');

        const hidden = park(HIDE_ON_OPEN, 'data-switcher-hidden');
        if (hidden.length) {
            gsap.to(hidden, { opacity: 0, duration: CHROME_FADE_S, ease: 'power2.out' });
        }

        root.hidden = false;
        selected = currentIndex;
        rendered = CURRENT_SITE;

        resetTitles();
        resetChamber();
        markActive();

        root.classList.toggle('is-pointer', onPointerDevice());
        overControls = pointerX != null && nearControls(pointerX, pointerY);
        root.classList.toggle('is-near-control', overControls);
        setControls(SITES[currentIndex]);
        document.body.dataset.switcherSite = CURRENT_SITE;

        if (injLogo && hostLogo) {
            pageLogoWidth = hostLogo.getBoundingClientRect().width;
            renderLogo(SITES[currentIndex]);
            gsap.set(wordUnits(injLogo), { clearProps: 'all' });
            hostLogo.classList.add(OFF);
            injLogo.classList.remove(OFF);
            sizeLogo(pageLogoWidth, parseFloat(injLogo.dataset.restWidth));
        }

        /* It always opens on your own slide, so the ground starts down. */
        paintBackdrop(SITES[currentIndex]);
        paintFrame(SITES[currentIndex]);
        gsap.set(ground(), { autoAlpha: 0 });

        centreStage(true);

        gsap.timeline()
            .to(root, { opacity: 1, duration: PANEL_IN_S, ease: 'power2.out' }, 0)
            .fromTo(rows,
                { x: -18 },
                { x: 0, duration: PANEL_IN_S, ease: 'power3.out', stagger: 0.04 },
                0)
            .fromTo(cta,
                { opacity: 0, y: 14 },
                { opacity: 1, y: 0, duration: PANEL_IN_S, ease: 'power3.out' },
                0.1)
            .fromTo(note,
                { opacity: 0, y: -12 },
                { opacity: 1, y: 0, duration: PANEL_IN_S, ease: 'power3.out' },
                0.1);

        listen(true);
        focusActive();
    }

    function closeSwitcher() {
        if (!open || busy) return;

        if (selected !== currentIndex) {
            busy = true;
            goTo(currentIndex);
            setTimeout(() => { busy = false; closeSwitcher(); },
                       SWAP_SETTLE_MS + SWAP_TOTAL_S * 1000);
            return;
        }

        open = false;
        listen(false);
        clearTimeout(swapTimer);
        centreStage(false);
        setHint(false);
        overControls = false;
        root.classList.remove('is-pointer', 'is-near-control');
        trigger.classList.remove('is-armed');
        document.body.classList.remove('switcher-open');
        trigger.setAttribute('aria-expanded', 'false');

        unpark('data-switcher-hidden').forEach(({ el, opacity }) => {
            gsap.to(el, { opacity: opacity, duration: CHROME_FADE_S, ease: 'power2.out' });
        });

        if (injLogo && hostLogo) {
            sizeLogo(parseFloat(injLogo.dataset.restWidth), pageLogoWidth, () => {
                injLogo.classList.add(OFF);
                hostLogo.classList.remove(OFF);
            });
        }

        gsap.to(root, {
            opacity: 0,
            duration: PANEL_OUT_S,
            ease: 'power2.in',
            onComplete: () => {
                root.hidden = true;
                resetChamber();
                clearPalette();
                delete document.body.dataset.switcherSite;
            }
        });

        trigger.focus({ preventScroll: true });
    }

    function toggle(e) {
        if (e && e.detail > 0 && typeof e.clientX === 'number') {
            pointerX = e.clientX;
            pointerY = e.clientY;
        }
        if (open) closeSwitcher();
        else openSwitcher();
    }

    function travel() {
        if (leaving) return;
        const site = SITES[selected];

        if (site.id === CURRENT_SITE || !site.url) {
            closeSwitcher();
            return;
        }
        leave(site);
    }

    let leaving = false;

    function leave(site) {
        if (leaving) return;
        leaving = true;

        const veil = document.createElement('div');
        veil.className = 'switcher-exit';
        veil.style.backgroundColor = site.exitColor || EXIT_COLOR;
        document.body.appendChild(veil);

        gsap.to(veil, {
            opacity: 1,
            duration: EXIT_S,
            ease: 'power2.inOut',
            onComplete: () => { window.location.href = site.url; }
        });
    }

    function unwind() {
        leaving = false;
        document.querySelectorAll('.switcher-exit').forEach((el) => {
            gsap.killTweensOf(el);
            el.remove();
        });

        if (!root) return;

        if (open) listen(false);
        open = false;
        busy = false;
        clearTimeout(swapTimer);
        if (swapTl) { swapTl.kill(); swapTl = null; }

        gsap.killTweensOf(ground().concat([root, hint, cta, note].filter(Boolean)));
        gsap.killTweensOf(hostParts().concat(injParts()));
        focusToken++;
        resetChamber();

        showInjected(false);
        showHost(true);
        gsap.set(hostParts(), { opacity: 1, y: 0, clearProps: 'filter' });
        if (stageInner) {
            gsap.killTweensOf(stageInner);
            gsap.set(stageInner, { clearProps: 'transform' });
        }
        rendered = CURRENT_SITE;

        if (injLogo && hostLogo) {
            gsap.killTweensOf(injLogo.firstElementChild || injLogo);
            injLogo.classList.add(OFF);
            hostLogo.classList.remove(OFF);
        }

        unpark().forEach(({ el, opacity }) => {
            gsap.killTweensOf(el);
            gsap.set(el, { opacity: opacity });
        });
        muted = false;

        gsap.set(ground(), { autoAlpha: 0 });

        hintWanted = false;
        hintShown = false;
        overControls = false;
        if (hint) gsap.set(hint, { autoAlpha: 0, scale: 0.9 });

        root.classList.remove('is-pointer', 'is-near-control');
        trigger.classList.remove('is-armed');
        gsap.set(root, { opacity: 0 });
        root.hidden = true;

        document.body.classList.remove('switcher-open');
        trigger.setAttribute('aria-expanded', 'false');
        clearPalette();
        delete document.body.dataset.switcherSite;

        selected = currentIndex;
        markActive();
        resetTitles();
    }

    let hintWanted = false;
    let hintShown = false;
    let pointerX = null;
    let pointerY = null;

    function setHint(on) {
        hintWanted = on;
        if (!hint) return;
        if (on) revealHint();
        else hideHint();
    }

    function revealHint() {
        if (!hint || hintShown || !hintWanted || overControls || pointerX == null) return;

        hintShown = true;
        gsap.set(hint, { x: pointerX, y: pointerY });
        gsap.to(hint, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
    }

    function hideHint() {
        if (!hint || !hintShown) return;
        hintShown = false;
        gsap.to(hint, { autoAlpha: 0, scale: 0.9, duration: 0.25, ease: 'power2.in' });
    }

    const NAV_CLEARANCE = 44;
    const TRIGGER_CLEARANCE = 26;
    let overControls = false;

    function within(el, x, y, pad) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left - pad && x <= r.right + pad &&
               y >= r.top - pad && y <= r.bottom + pad;
    }

    function nearControls(x, y) {
        return within(navEl, x, y, NAV_CLEARANCE) ||
               within(trigger, x, y, TRIGGER_CLEARANCE);
    }

    function setOverControls(near) {
        if (near === overControls) return;
        overControls = near;
        root.classList.toggle('is-near-control', near);
        if (near) hideHint();
        else revealHint();
    }

    function setArmed(x, y) {
        trigger.classList.toggle('is-armed', x != null && within(trigger, x, y, TRIGGER_CLEARANCE));
    }

    let wheelAcc = 0;
    let wheelLocked = false;
    let touchY = null;

    function onWheel(e) {
        e.preventDefault();
        if (wheelLocked) return;

        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;

        const dir = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        wheelLocked = true;
        setTimeout(() => { wheelLocked = false; }, WHEEL_COOLDOWN_MS);
        step(dir);
    }

    function onTouchStart(e) {
        touchY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
        if (touchY === null) return;
        const dy = touchY - e.touches[0].clientY;
        if (Math.abs(dy) < SWIPE_THRESHOLD) return;
        touchY = e.touches[0].clientY;
        step(dy > 0 ? 1 : -1);
    }

    function onTouchEnd() {
        touchY = null;
    }

    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSwitcher();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(1);
            focusActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(-1);
            focusActive();
        } else if (e.key === 'Enter' && e.target === cta) {
            /* the button's own click handles it */
        }
    }

    function focusActive() {
        const active = rows[selected];
        if (active && document.activeElement !== cta) active.focus({ preventScroll: true });
    }

    function onRootClick(e) {
        if (e.target.closest('.switcher-nav, .switcher-cta')) return;
        travel();
    }

    function onPointerMove(e) {
        pointerX = e.clientX;
        pointerY = e.clientY;

        setOverControls(nearControls(pointerX, pointerY));
        setArmed(pointerX, pointerY);

        if (!hintShown) {
            revealHint();
            return;
        }
        if (hintToX) {
            hintToX(pointerX);
            hintToY(pointerY);
        }
    }

    function onTriggerEnter(e) {
        trackPointer(e);
        setOverControls(true);
        setArmed(pointerX, pointerY);
    }

    function onTriggerLeave(e) {
        trackPointer(e);
        setOverControls(pointerX != null && nearControls(pointerX, pointerY));
        setArmed(pointerX, pointerY);
    }

    function trackPointer(e) {
        if (!e || typeof e.clientX !== 'number') return;
        pointerX = e.clientX;
        pointerY = e.clientY;
    }

    function onResize() {
        if (!open) return;
        centreStage(true);
    }

    function onPointerModeChange() {
        if (!open || !root) return;
        const usePointer = onPointerDevice();
        root.classList.toggle('is-pointer', usePointer);
        setHint(usePointer);
    }

    function listen(on) {
        const m = on ? 'addEventListener' : 'removeEventListener';
        root[m]('wheel', onWheel, { passive: false });
        root[m]('touchstart', onTouchStart, { passive: true });
        root[m]('touchmove', onTouchMove, { passive: true });
        root[m]('touchend', onTouchEnd, { passive: true });
        root[m]('click', onRootClick);
        root[m]('pointermove', onPointerMove, { passive: true });
        trigger[m]('pointerenter', onTriggerEnter, { passive: true });
        trigger[m]('pointerleave', onTriggerLeave, { passive: true });
        document[m]('keydown', onKey);
        window[m]('resize', onResize);
        mqPointer[m]('change', onPointerModeChange);
    }

    function wire() {
        rows.forEach((el) => {
            el.addEventListener('click', () => goTo(Number(el.dataset.site)));
            el.addEventListener('pointerenter', () => {
                hoveredRow = el;
                refreshTitles();
            }, { passive: true });
            el.addEventListener('pointerleave', () => {
                if (hoveredRow === el) hoveredRow = null;
                refreshTitles();
            }, { passive: true });
        });
        cta.addEventListener('click', travel);
    }


    trigger.classList.add('site-switcher-trigger');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-label', 'Our properties');

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggle();
    });

    window.addEventListener('pagehide', unwind);
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) unwind();
    });
    window.addEventListener('load', () => setTimeout(preload, 1200));
    trigger.addEventListener('pointerenter', preload);

})();
