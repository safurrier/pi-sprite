#!/usr/bin/env python3
"""Remove edge-connected flat/checker backgrounds from generated pi-sprite images.

This is a local post-processing helper. It does not call network APIs. It uses
Pillow to make edge-connected background pixels transparent, then optionally
normalizes the sprite onto a square canvas for pi-sprite imports.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import deque
from pathlib import Path
from typing import Any


def parse_color(value: str) -> tuple[int, int, int]:
    text = value.strip().removeprefix("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError("colors must be 6-digit hex, e.g. #ffffff")
    try:
        return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("colors must be 6-digit hex, e.g. #ffffff") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove an edge-connected background from a generated pi-sprite image.")
    parser.add_argument("--input", type=Path, required=True, help="Input PNG/JPEG/WebP image")
    parser.add_argument("--output", type=Path, required=True, help="Output PNG path")
    parser.add_argument("--metadata", type=Path, help="Optional metadata JSON path")
    parser.add_argument("--target-size", type=int, default=128, help="Final square canvas size in pixels; use 0 to preserve size")
    parser.add_argument("--padding", type=int, default=10, help="Padding around cropped sprite when target-size is set")
    parser.add_argument(
        "--threshold",
        type=float,
        default=38.0,
        help="RGB distance threshold for background matching. Raise for checker/near-white backgrounds.",
    )
    parser.add_argument(
        "--background-color",
        type=parse_color,
        action="append",
        default=[],
        help="Background color to remove, as #RRGGBB. Repeatable. Defaults to sampled edge colors.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write metadata only; do not write the output image")
    return parser.parse_args()


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a[index] - b[index]) ** 2 for index in range(3)))


def close_to_any(color: tuple[int, int, int], samples: list[tuple[int, int, int]], threshold: float) -> bool:
    return any(color_distance(color, sample) <= threshold for sample in samples)


def edge_positions(width: int, height: int) -> list[tuple[int, int]]:
    positions: list[tuple[int, int]] = []
    for x in range(width):
        positions.append((x, 0))
        positions.append((x, height - 1))
    for y in range(1, height - 1):
        positions.append((0, y))
        positions.append((width - 1, y))
    return positions


def sampled_edge_colors(image: Any, explicit: list[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    if explicit:
        return explicit
    width, height = image.size
    candidates = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (width // 2, height - 1),
        (0, height // 2),
        (width - 1, height // 2),
    ]
    seen: set[tuple[int, int, int]] = set()
    samples: list[tuple[int, int, int]] = []
    pixels = image.load()
    for pos in candidates:
        pixel = pixels[pos[0], pos[1]]
        color = (pixel[0], pixel[1], pixel[2])
        if color not in seen:
            seen.add(color)
            samples.append(color)
    return samples


def transparent_background_mask(image: Any, samples: list[tuple[int, int, int]], threshold: float) -> set[tuple[int, int]]:
    width, height = image.size
    pixels = image.load()
    visited: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    for position in edge_positions(width, height):
        pixel = pixels[position[0], position[1]]
        if pixel[3] == 0 or close_to_any((pixel[0], pixel[1], pixel[2]), samples, threshold):
            visited.add(position)
            queue.append(position)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in visited:
                continue
            pixel = pixels[nx, ny]
            if pixel[3] == 0 or close_to_any((pixel[0], pixel[1], pixel[2]), samples, threshold):
                visited.add((nx, ny))
                queue.append((nx, ny))
    return visited


def normalize_canvas(image: Any, target_size: int, padding: int) -> tuple[Any, tuple[int, int, int, int] | None]:
    if target_size <= 0:
        return image, image.getbbox()
    bbox = image.getbbox()
    if bbox is None:
        return image.resize((target_size, target_size)), None

    from PIL import Image

    cropped = image.crop(bbox)
    max_sprite_size = max(1, target_size - 2 * padding)
    scale = min(max_sprite_size / cropped.width, max_sprite_size / cropped.height, 1.0)
    resized = cropped.resize((max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    left = (target_size - resized.width) // 2
    top = target_size - padding - resized.height
    canvas.alpha_composite(resized, (left, max(0, top)))
    return canvas, bbox


def process(args: argparse.Namespace) -> dict[str, Any]:
    if not args.input.exists():
        raise ValueError(f"input image missing: {args.input}")
    if args.target_size < 0:
        raise ValueError("--target-size must be >= 0")
    if args.padding < 0:
        raise ValueError("--padding must be >= 0")

    from PIL import Image

    original = Image.open(args.input)
    image = original.convert("RGBA")
    width, height = image.size
    samples = sampled_edge_colors(image, args.background_color)
    background_pixels = transparent_background_mask(image, samples, args.threshold)

    pixels = image.load()
    for x, y in background_pixels:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

    normalized, bbox = normalize_canvas(image, args.target_size, args.padding)
    if not args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        normalized.save(args.output, format="PNG")

    metadata = {
        "input": str(args.input),
        "output": str(args.output),
        "dry_run": args.dry_run,
        "original_mode": original.mode,
        "original_size": [width, height],
        "target_size": args.target_size,
        "padding": args.padding,
        "threshold": args.threshold,
        "background_samples": [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in samples],
        "removed_edge_connected_pixels": len(background_pixels),
        "nontransparent_bbox": list(bbox) if bbox else None,
        "output_size": list(normalized.size),
        "has_alpha": True,
    }
    if args.metadata:
        args.metadata.parent.mkdir(parents=True, exist_ok=True)
        args.metadata.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return metadata


def main() -> int:
    try:
        args = parse_args()
        metadata = process(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"input: {metadata['input']}")
    print(f"output: {metadata['output']}")
    print(f"dry_run: {metadata['dry_run']}")
    print(f"removed_edge_connected_pixels: {metadata['removed_edge_connected_pixels']}")
    print(f"output_size: {metadata['output_size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
