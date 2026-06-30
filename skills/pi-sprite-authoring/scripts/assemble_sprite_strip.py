#!/usr/bin/env python3
"""Assemble normalized pi-sprite frames into a horizontal animation strip."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Assemble pi-sprite frame PNGs into a horizontal animation strip.")
    parser.add_argument("--frame", type=Path, action="append", required=True, help="Input frame image path; repeat in animation order")
    parser.add_argument("--output", type=Path, required=True, help="Output strip PNG path")
    parser.add_argument("--metadata", type=Path, help="Optional metadata JSON path")
    parser.add_argument("--frame-width", type=int, default=128, help="Frame width in pixels")
    parser.add_argument("--frame-height", type=int, default=128, help="Frame height in pixels")
    parser.add_argument("--fit", choices=["contain", "cover"], default="contain", help="Resize mode for each input frame")
    parser.add_argument("--dry-run", action="store_true", help="Write metadata only; do not write the strip")
    return parser.parse_args()


def process(args: argparse.Namespace) -> dict[str, Any]:
    if args.frame_width <= 0 or args.frame_height <= 0:
        raise ValueError("--frame-width and --frame-height must be positive")
    if not args.frame:
        raise ValueError("at least one --frame is required")
    for frame in args.frame:
        if not frame.exists():
            raise ValueError(f"frame image missing: {frame}")
        if not frame.is_file():
            raise ValueError(f"frame image is not a file: {frame}")

    from PIL import Image

    normalized: list[Image.Image] = []
    input_sizes: list[list[int]] = []
    for frame in args.frame:
        image = Image.open(frame).convert("RGBA")
        input_sizes.append([image.width, image.height])
        if args.fit == "contain":
            image.thumbnail((args.frame_width, args.frame_height), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (args.frame_width, args.frame_height), (0, 0, 0, 0))
            canvas.alpha_composite(image, ((args.frame_width - image.width) // 2, (args.frame_height - image.height) // 2))
        else:
            scale = max(args.frame_width / image.width, args.frame_height / image.height)
            resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
            left = (resized.width - args.frame_width) // 2
            top = (resized.height - args.frame_height) // 2
            canvas = resized.crop((left, top, left + args.frame_width, top + args.frame_height))
        normalized.append(canvas)

    output_size = [args.frame_width * len(normalized), args.frame_height]
    if not args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        strip = Image.new("RGBA", tuple(output_size), (0, 0, 0, 0))
        for index, frame in enumerate(normalized):
            strip.alpha_composite(frame, (index * args.frame_width, 0))
        strip.save(args.output, format="PNG")

    metadata = {
        "dry_run": args.dry_run,
        "output": str(args.output),
        "frames": [str(frame) for frame in args.frame],
        "frame_count": len(args.frame),
        "frame_width": args.frame_width,
        "frame_height": args.frame_height,
        "fit": args.fit,
        "input_sizes": input_sizes,
        "output_size": output_size,
        "manifest_frame": {"width": args.frame_width, "height": args.frame_height},
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

    print(f"output: {metadata['output']}")
    print(f"dry_run: {metadata['dry_run']}")
    print(f"frame_count: {metadata['frame_count']}")
    print(f"frame_size: {metadata['frame_width']}x{metadata['frame_height']}")
    print(f"output_size: {metadata['output_size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
