#!/usr/bin/env python3
"""Create a simple motion-loop strip from one pi-sprite state image."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PRESETS: dict[str, list[tuple[int, int]]] = {
    "bob": [(0, 1), (0, -2), (0, -1), (0, 1)],
    "thinking-bob": [(0, 1), (-1, -2), (0, -1), (1, 1)],
    "working-tap": [(0, 1), (0, -1), (1, 0), (0, -1), (-1, 0), (0, 1)],
    "success-bounce": [(0, 1), (0, -3), (0, -1), (0, -3), (0, 1)],
    "error-droop": [(0, 0), (0, 2), (-1, 1), (0, 2)],
}


def parse_offset(value: str) -> tuple[int, int]:
    try:
        x_text, y_text = value.split(",", 1)
        return int(x_text), int(y_text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("offsets must be X,Y pixel pairs, e.g. 0,-2") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a simple pi-sprite motion strip from a single frame image.")
    parser.add_argument("--input", type=Path, required=True, help="Input state image")
    parser.add_argument("--output", type=Path, required=True, help="Output strip PNG path")
    parser.add_argument("--metadata", type=Path, help="Optional metadata JSON path")
    parser.add_argument("--frame-width", type=int, default=128, help="Frame width in pixels")
    parser.add_argument("--frame-height", type=int, default=128, help="Frame height in pixels")
    parser.add_argument("--preset", choices=sorted(PRESETS), default="bob", help="Built-in motion preset")
    parser.add_argument(
        "--offset",
        type=parse_offset,
        action="append",
        default=[],
        help="Custom X,Y pixel offset; repeat to override --preset",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write metadata only; do not write the strip")
    return parser.parse_args()


def process(args: argparse.Namespace) -> dict[str, Any]:
    if args.frame_width <= 0 or args.frame_height <= 0:
        raise ValueError("--frame-width and --frame-height must be positive")
    if not args.input.exists():
        raise ValueError(f"input image missing: {args.input}")
    if not args.input.is_file():
        raise ValueError(f"input image is not a file: {args.input}")

    from PIL import Image

    offsets = args.offset or PRESETS[args.preset]
    source = Image.open(args.input).convert("RGBA")
    source.thumbnail((args.frame_width, args.frame_height), Image.Resampling.LANCZOS)
    centered = Image.new("RGBA", (args.frame_width, args.frame_height), (0, 0, 0, 0))
    centered.alpha_composite(source, ((args.frame_width - source.width) // 2, (args.frame_height - source.height) // 2))

    output_size = [args.frame_width * len(offsets), args.frame_height]
    if not args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        strip = Image.new("RGBA", tuple(output_size), (0, 0, 0, 0))
        for index, (dx, dy) in enumerate(offsets):
            frame = Image.new("RGBA", (args.frame_width, args.frame_height), (0, 0, 0, 0))
            frame.alpha_composite(centered, (dx, dy))
            strip.alpha_composite(frame, (index * args.frame_width, 0))
        strip.save(args.output, format="PNG")

    metadata = {
        "dry_run": args.dry_run,
        "input": str(args.input),
        "output": str(args.output),
        "preset": args.preset,
        "offsets": [[x, y] for x, y in offsets],
        "frame_count": len(offsets),
        "frame_width": args.frame_width,
        "frame_height": args.frame_height,
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

    print(f"input: {metadata['input']}")
    print(f"output: {metadata['output']}")
    print(f"dry_run: {metadata['dry_run']}")
    print(f"preset: {metadata['preset']}")
    print(f"frame_count: {metadata['frame_count']}")
    print(f"output_size: {metadata['output_size']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
