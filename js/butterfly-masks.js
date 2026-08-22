/* ============================================
   COUNTER- CLT — BUTTERFLY CLIP MASKS
   ============================================ */

import * as THREE from "three";

export const BUTTERFLY_COUNT = 25;

/* Distance-field resolution per mask. Powers of two only — the fallback path
   still uploads four channels, and mipmapping a non-power-of-two texture is
   not valid there.

   Cost is this figure squared, twice over, per mask. Measured across the set
   of 25, once the transforms were broken up and the upload cut to a single
   channel: 512 costs 877ms and 8.3MB, 256 costs 333ms and 2.1MB. A field is
   not an image — it interpolates, so the edge it reconstructs holds up far
   below the resolution a photograph would need, and the difference between
   the two is a fraction of a pixel at the size these draw. Desktop can spend
   it; a phone is the machine that has neither the memory nor the CPU. */
const MASK_SIZE = window.matchMedia("(pointer: coarse)").matches ? 256 : 512;

/* Columns (then rows) a distance transform gets through before handing the
   thread back. Sized to keep any one turn near a couple of milliseconds. */
const EDT_CHUNK = 32;

/* A rasterisation that came back blank — an SVG carrying its own fill, or one
   drawn with strokes rather than filled paths — has no silhouette to measure.
   Its field would normalise to NaN, land in the texture as zero, and read as
   "outside everywhere", which shows up as planes that are simply invisible
   with nothing logged. Below this many pixels either way, the mask is dropped
   instead. */
const MIN_SOLID = 64;
/* Low-res copy kept in JS so a click can be tested against the shape itself. */
const PICK_SIZE = 64;
/* Empty margin left around the silhouette, as a fraction of the texture. This
   is the runway the reveal grows along before it runs out of field, so it buys
   smoothness at the cost of resolution on the shape itself. */
const MASK_PAD = 0.12;

const MASK_DIR = "images/butterfly/";
const INF = 1e20;

function maskUrl(i) {
    const n = i + 1;
    return MASK_DIR + "butterfly-" + (n < 10 ? "0" + n : n) + ".svg";
}

function viewBoxAspect(svg) {
    const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[2] / vb[3];
    return 1;
}

function silhouette(text) {
    return new Promise(function (resolve, reject) {
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const svg = doc.querySelector("svg");
        if (!svg || doc.querySelector("parsererror")) {
            reject();
            return;
        }

        /* Drawn at its own proportions inside the square, so the distance field
           is measured in a space the shape is not distorted in. */
        const aspect = viewBoxAspect(svg);
        const avail = MASK_SIZE * (1 - MASK_PAD * 2);
        const w = aspect >= 1 ? avail : avail * aspect;
        const h = aspect >= 1 ? avail / aspect : avail;
        const dx = (MASK_SIZE - w) / 2;
        const dy = (MASK_SIZE - h) / 2;

        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("fill", "#fff");

        const blob = new Blob([new XMLSerializer().serializeToString(svg)],
                              { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = function () {
            const cv = document.createElement("canvas");
            cv.width = MASK_SIZE;
            cv.height = MASK_SIZE;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
            ctx.drawImage(img, dx, dy, w, h);
            URL.revokeObjectURL(url);
            resolve({
                pixels: ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data,
                w: w / MASK_SIZE,
                h: h / MASK_SIZE
            });
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject();
        };
        img.src = url;
    });
}

function edt1d(f, d, v, z, n) {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;

    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const dq = q - v[k];
        d[q] = dq * dq + f[v[k]];
    }
}

async function edt(seed, size) {
    const grid = new Float64Array(size * size);
    for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : INF;

    const f = new Float64Array(size);
    const d = new Float64Array(size);
    const v = new Int32Array(size);
    const z = new Float64Array(size + 1);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) f[y] = grid[y * size + x];
        edt1d(f, d, v, z, size);
        for (let y = 0; y < size; y++) grid[y * size + x] = d[y];
        if (x % EDT_CHUNK === EDT_CHUNK - 1) await yieldNow();
    }

    for (let y = 0; y < size; y++) {
        const row = y * size;
        for (let x = 0; x < size; x++) f[x] = grid[row + x];
        edt1d(f, d, v, z, size);
        for (let x = 0; x < size; x++) grid[row + x] = Math.sqrt(d[x]);
        if (y % EDT_CHUNK === EDT_CHUNK - 1) await yieldNow();
    }

    return grid;
}

async function field(pixels) {
    const n = MASK_SIZE * MASK_SIZE;
    const solid = new Uint8Array(n);
    const empty = new Uint8Array(n);
    let solidCount = 0;

    for (let i = 0; i < n; i++) {
        const on = pixels[i * 4 + 1] > 127 ? 1 : 0;
        solid[i] = on;
        empty[i] = on ? 0 : 1;
        solidCount += on;
    }

    if (solidCount < MIN_SOLID || solidCount > n - MIN_SOLID) return null;

    const toSolid = await edt(solid, MASK_SIZE);
    const toEmpty = await edt(empty, MASK_SIZE);

    /* One scale for both sides of the edge. Normalising the inside and the
       outside separately puts a kink in the field's slope at exactly the
       boundary, and the shader reads that slope to size its own antialiasing —
       so it would measure one width just inside the silhouette and another
       just outside it. */
    let scale = 0;
    for (let i = 0; i < n; i++) {
        const d = solid[i] ? toEmpty[i] : toSolid[i];
        if (d > scale) scale = d;
    }
    if (!(scale > 0) || !Number.isFinite(scale)) return null;

    const out = new Uint8Array(n);
    for (let y = 0; y < MASK_SIZE; y++) {
        const src = (MASK_SIZE - 1 - y) * MASK_SIZE;
        const dst = y * MASK_SIZE;
        for (let x = 0; x < MASK_SIZE; x++) {
            const i = src + x;
            const t = solid[i]
                ? 0.5 + 0.5 * (toEmpty[i] / scale)
                : 0.5 - 0.5 * (toSolid[i] / scale);
            out[dst + x] = Math.round(Math.max(0, Math.min(1, t)) * 255);
        }
    }
    return out;
}

/* A field is one number per texel, so on WebGL2 it is uploaded as one channel
   rather than four — the same shape for a quarter of the memory, on the GPU
   and in the heap copy the texture holds on to. The shader reads .r, which is
   also what the four-channel fallback writes to. */
const SINGLE_CHANNEL = (function () {
    try {
        return Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch (e) {
        return false;
    }
})();

function toTexture(data) {
    let tex;
    if (SINGLE_CHANNEL) {
        tex = new THREE.DataTexture(data, MASK_SIZE, MASK_SIZE, THREE.RedFormat);
    } else {
        const rgba = new Uint8Array(data.length * 4);
        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            rgba[i * 4] = v;
            rgba[i * 4 + 1] = v;
            rgba[i * 4 + 2] = v;
            rgba[i * 4 + 3] = 255;
        }
        tex = new THREE.DataTexture(rgba, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat);
    }

    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
}

function pickGrid(data) {
    const grid = new Uint8Array(PICK_SIZE * PICK_SIZE);
    const step = MASK_SIZE / PICK_SIZE;

    for (let y = 0; y < PICK_SIZE; y++) {
        const sy = Math.min(MASK_SIZE - 1, Math.floor((y + 0.5) * step));
        for (let x = 0; x < PICK_SIZE; x++) {
            const sx = Math.min(MASK_SIZE - 1, Math.floor((x + 0.5) * step));
            grid[y * PICK_SIZE + x] = data[sy * MASK_SIZE + sx];
        }
    }
    return grid;
}

/* A message to ourselves, rather than setTimeout: nested timeouts get clamped
   to about four milliseconds, and at several hundred yields across the set that
   clamp alone would cost more than the work being broken up. Only ever one
   yield is outstanding — the build awaits each in turn. */
const yieldNow = (function () {
    if (typeof MessageChannel !== "function") {
        return function () {
            return new Promise(function (resolve) { setTimeout(resolve, 0); });
        };
    }
    const channel = new MessageChannel();
    let pending = null;
    channel.port1.onmessage = function () {
        const resolve = pending;
        pending = null;
        if (resolve) resolve();
    };
    return function () {
        return new Promise(function (resolve) {
            pending = resolve;
            channel.port2.postMessage(0);
        });
    };
})();

/* Fetching and decoding run together — that part is the browser's to schedule
   and mostly off the main thread. Building the fields does not: it is a long
   synchronous burn per mask, so they are taken one at a time with the thread
   handed back in between, which trades a slightly later finish for an intro
   that never freezes. */
export async function loadButterflyMasks() {
    /* Only the markup is fetched together — it is a few kilobytes each and the
       requests should overlap. Rasterising is held back to one at a time: the
       pixel buffers are a megabyte apiece, and drawing all of them up front
       just to queue them for the field would spike the heap for no gain. */
    const texts = await Promise.all(
        Array.from({ length: BUTTERFLY_COUNT }, function (unused, i) {
            return fetch(maskUrl(i))
                .then(function (res) {
                    return res.ok ? res.text() : Promise.reject(new Error(res.status));
                })
                .catch(function () { return null; });
        })
    );

    const masks = [];
    for (let i = 0; i < texts.length; i++) {
        if (!texts[i]) continue;

        let shape = null;
        try {
            shape = await silhouette(texts[i]);
        } catch (e) {
            shape = null;
        }
        if (!shape) continue;

        const data = await field(shape.pixels);
        if (data) {
            masks.push({
                texture: toTexture(data),
                pick: pickGrid(data),
                size: PICK_SIZE,
                w: shape.w,
                h: shape.h
            });
        }
        await yieldNow();
    }

    return masks;
}
