#!/usr/bin/env python3
"""
Regenerates js/canvas-manifest.json from the contents of images/.

Each filter maps to one or more folders under images/. "the Menus" owns no
folder of its own — it re-shows the experience + details sets, per the brief.

Each filter also carries an `anchor`: the point the canvas images gather into
when that item is chosen, in normalised screen coords (x -1 = left / +1 = right,
y -1 = bottom / +1 = top). Every menu item collects in a different place.

Run from the project root after adding or removing images:

    python3 tools/generate-manifest.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
OUT_PATH = os.path.join(ROOT, "js", "canvas-manifest.json")

EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

# id -> (label, [source folders], collect anchor [x, y])
FILTERS = [
    ("experience", "the Experience", ["experience"],            [-1, -1]),  # bottom left
    ("design",     "the Design",     ["design"],                [ 1, -1]),  # bottom right
    ("details",    "the Details",    ["details"],               [ 1,  1]),  # top right
    ("menus",      "the Menus",      ["experience", "details"], [-1,  1]),  # top left
    ("beverages",  "the Beverages",  ["beverages"],             [ 0,  1]),  # middle top
    ("team",       "the Team",       ["team"],                  [ 0,  0]),  # centre
]


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

    # One entry per file on disk. `filters` lists every filter that shows it,
    # so the menus set doesn't duplicate the experience/details entries.
    for filter_id, _label, folders, _anchor in FILTERS:
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
            {"id": fid, "label": label, "folders": folders, "anchor": anchor}
            for fid, label, folders, anchor in FILTERS
        ],
        "images": images,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print("Wrote %s" % os.path.relpath(OUT_PATH, ROOT))
    print("  %d images" % len(images))
    for fid, label, _folders, anchor in FILTERS:
        count = sum(1 for i in images if fid in i["filters"])
        print("  %-11s %-16s %3d  anchor %s" % (fid, label, count, anchor))


if __name__ == "__main__":
    main()
