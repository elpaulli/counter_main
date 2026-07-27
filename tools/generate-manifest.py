#!/usr/bin/env python3
"""
Regenerates js/canvas-manifest.json from the contents of images/.

Each filter maps to one or more folders under images/.

Each filter also carries:

  anchor  the point the canvas images gather into when that item is chosen, in
          normalised screen coords (x -1 = left / +1 = right, y -1 = bottom /
          +1 = top). Every menu item collects in a different place.

  layout  what the images do after gathering — "scatter" back into the 3D field,
          or "reel" into a scrolling strip.

  side    which edge a "reel" strip runs along: "left"/"right" scroll
          vertically, "top"/"bottom" scroll horizontally. The filter's copy
          panel is placed on the opposite side automatically, so this is the
          only place the pairing is declared.

INTRO_CAPS limits how many images a folder may contribute to the opening
(unfiltered) view, so a folder can be present there without dominating it while
still showing in full behind its own filter.

Run from the project root after adding or removing images:

    python3 tools/generate-manifest.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
OUT_PATH = os.path.join(ROOT, "js", "canvas-manifest.json")

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

# id -> (label, [source folders], collect anchor [x, y], layout, reel side)
# Anchor comments are the gather corner; side is the strip's edge.
FILTERS = [
    ("experience", "the Experience", ["experience"], [-1, -1], "reel",    "right"),
    ("design",     "the Design",     ["design"],     [ 1, -1], "reel",    "bottom"),
    ("details",    "the Details",    ["details"],    [ 1,  1], "reel",    "left"),
    ("menus",      "the Menus",      ["menu"],       [-1,  1], "scatter", None),
    ("beverages",  "the Beverages",  ["beverages"],  [ 0,  1], "reel",    "right"),
    ("team",       "the Team",       ["team"],       [ 0,  0], "reel",    "top"),
]

# Most images a folder may contribute to the opening, unfiltered view. Folders
# not listed are uncapped. The menu shots are a small, deliberate set — a couple
# belong in the opening mix, the rest are the payoff for choosing "the Menus".
INTRO_CAPS = {
    "menu": 2,
}


def folder_images(folder):
    """Image paths in one folder, sorted, web-relative, skipping dotfiles."""
    path = os.path.join(IMAGES_DIR, folder)
    if not os.path.isdir(path):
        return []
    names = [
        n for n in os.listdir(path)
        if not n.startswith(".") and n.lower().endswith(EXTENSIONS)
    ]
    return ["images/%s/%s" % (folder, n) for n in sorted(names)]


def main():
    images = []
    seen = {}

    # One entry per file on disk. `filters` lists every filter that shows it, so
    # a file shared by two filters isn't duplicated in the image list.
    for filter_id, _label, folders, _anchor, _layout, _side in FILTERS:
        for folder in folders:
            for src in folder_images(folder):
                if src in seen:
                    seen[src]["filters"].append(filter_id)
                    continue
                entry = {"src": src, "folder": folder, "filters": [filter_id]}
                seen[src] = entry
                images.append(entry)

    manifest = {
        "filters": [
            {
                "id": fid,
                "label": label,
                "folders": folders,
                "anchor": anchor,
                "layout": layout,
                "side": side,
            }
            for fid, label, folders, anchor, layout, side in FILTERS
        ],
        "introCaps": INTRO_CAPS,
        "images": images,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print("Wrote %s" % os.path.relpath(OUT_PATH, ROOT))
    print("  %d images" % len(images))
    for fid, label, _folders, anchor, layout, side in FILTERS:
        count = sum(1 for i in images if fid in i["filters"])
        print("  %-11s %-16s %3d  anchor %-9s %-8s %s"
              % (fid, label, count, anchor, layout, side or "-"))
    if INTRO_CAPS:
        print("  intro caps: %s" % INTRO_CAPS)


if __name__ == "__main__":
    main()
