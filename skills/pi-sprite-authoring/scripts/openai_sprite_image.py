#!/usr/bin/env python3
"""Generate pi-sprite pet images with OpenAI GPT Image.

The script intentionally stays small: one prompt in, optional reference images,
one generated sprite candidate out. Use --dry-run to validate prompt/reference
wiring and write metadata without requiring OPENAI_API_KEY or the openai package.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

SUPPORTED_REFERENCE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}
DEFAULT_MODEL = "gpt-image-2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a pi-sprite image with OpenAI GPT Image.")
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt", help="Prompt text to send to OpenAI")
    prompt_group.add_argument("--prompt-file", type=Path, help="Path to a UTF-8 prompt file")
    parser.add_argument("--reference-image", type=Path, action="append", default=[], help="Local reference image path; repeatable")
    parser.add_argument(
        "--reference-role",
        action="append",
        default=[],
        help="Role for a reference image, e.g. character_reference or style_reference. Repeat in --reference-image order.",
    )
    parser.add_argument(
        "--reference-instruction",
        action="append",
        default=[],
        help="Instruction for a reference image; repeat in --reference-image order. One instruction may be reused for all references.",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("generated/pi-sprite"), help="Output directory")
    parser.add_argument("--prefix", default="sprite", help="Output filename prefix")
    parser.add_argument("--model", default=os.environ.get("OPENAI_IMAGE_MODEL", DEFAULT_MODEL), help="OpenAI image model")
    parser.add_argument("--size", default="1024x1024", help="OpenAI image size")
    parser.add_argument("--quality", default="low", help="OpenAI image quality")
    parser.add_argument("--output-format", choices=["png", "jpeg", "webp"], default="png", help="Output image format")
    parser.add_argument(
        "--background",
        choices=["transparent", "opaque", "auto"],
        default="auto",
        help="OpenAI background setting. Default: auto. Use transparent only with models that support it.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write prompt/metadata without calling OpenAI")
    return parser.parse_args()


def load_prompt(args: argparse.Namespace) -> str:
    if args.prompt is not None:
        prompt = args.prompt.strip()
    else:
        prompt = args.prompt_file.read_text(encoding="utf-8").strip()
    if not prompt:
        raise ValueError("prompt cannot be empty")
    return prompt


def values_for_references(values: list[str], paths: list[Path], *, default: str, flag: str) -> list[str]:
    if not paths:
        return []
    if not values:
        return [default for _ in paths]
    if len(values) == 1:
        return [values[0] for _ in paths]
    if len(values) != len(paths):
        raise ValueError(f"{flag} must be supplied once or once per --reference-image")
    return values


def validate_references(paths: list[Path], instructions: list[str], roles: list[str]) -> list[dict[str, str]]:
    resolved_instructions = values_for_references(instructions, paths, default="", flag="--reference-instruction")
    resolved_roles = values_for_references(roles, paths, default="reference", flag="--reference-role")
    if paths and any(not instruction.strip() for instruction in resolved_instructions):
        raise ValueError("--reference-instruction is required when --reference-image is used")
    references: list[dict[str, str]] = []
    for index, path in enumerate(paths, start=1):
        if path.suffix.lower() not in SUPPORTED_REFERENCE_SUFFIXES:
            raise ValueError(f"unsupported reference image type: {path}")
        if not path.exists():
            raise ValueError(f"reference image missing: {path}")
        if not path.is_file():
            raise ValueError(f"reference image is not a file: {path}")
        if path.stat().st_size <= 0:
            raise ValueError(f"reference image is empty: {path}")
        references.append(
            {
                "id": f"reference-{index}",
                "path": str(path),
                "role": resolved_roles[index - 1].strip() or "reference",
                "instruction": resolved_instructions[index - 1].strip(),
            }
        )
    return references


def openai_image_files(paths: list[Path]) -> list[tuple[str, bytes, str]]:
    files: list[tuple[str, bytes, str]] = []
    for path in paths:
        mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
        if mime_type == "image/jpg":
            mime_type = "image/jpeg"
        files.append((path.name, path.read_bytes(), mime_type))
    return files


def image_data_to_b64(item: Any) -> str | None:
    if hasattr(item, "b64_json") and item.b64_json:
        return item.b64_json
    if isinstance(item, dict):
        return item.get("b64_json") or item.get("result")
    return None


def generate_image(args: argparse.Namespace, prompt: str) -> tuple[bytes, str | None]:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required unless --dry-run is set")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Python package 'openai' is required. Run with: uv run --with openai python ...") from exc

    client = OpenAI()
    kwargs: dict[str, Any] = {
        "model": args.model,
        "prompt": prompt,
        "size": args.size,
        "quality": args.quality,
        "output_format": args.output_format,
        "background": args.background,
    }
    if args.reference_image:
        image_files = openai_image_files(args.reference_image)
        result = client.images.edit(image=image_files if len(image_files) > 1 else image_files[0], **kwargs)
        method = "edit"
    else:
        result = client.images.generate(**kwargs)
        method = "generate"

    data = getattr(result, "data", None) or []
    if not data:
        raise RuntimeError("OpenAI response did not include image data")
    b64 = image_data_to_b64(data[0])
    if not b64:
        raise RuntimeError("OpenAI response did not include b64 image data")
    return base64.b64decode(b64), method


def write_outputs(args: argparse.Namespace, prompt: str, references: list[dict[str, str]]) -> dict[str, Any]:
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = args.output_dir / f"{args.prefix}-{stamp}"
    method = "edit" if args.reference_image else "generate"
    image_path: Path | None = None
    if not args.dry_run:
        image_bytes, method = generate_image(args, prompt)
        image_path = base.with_suffix(f".{args.output_format}")
        image_path.write_bytes(image_bytes)

    prompt_path = base.with_suffix(".prompt.txt")
    prompt_path.write_text(prompt + "\n", encoding="utf-8")
    metadata = {
        "dry_run": args.dry_run,
        "method": method,
        "model": args.model,
        "size": args.size,
        "quality": args.quality,
        "output_format": args.output_format,
        "background": args.background,
        "prompt_path": str(prompt_path),
        "image_path": str(image_path) if image_path else None,
        "references": references,
    }
    metadata_path = base.with_suffix(".metadata.json")
    metadata["metadata_path"] = str(metadata_path)
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return metadata


def main() -> int:
    try:
        args = parse_args()
        prompt = load_prompt(args)
        references = validate_references(args.reference_image, args.reference_instruction, args.reference_role)
        metadata = write_outputs(args, prompt, references)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"dry_run: {metadata['dry_run']}")
    print(f"method: {metadata['method']}")
    print(f"prompt: {metadata['prompt_path']}")
    print(f"metadata: {metadata['metadata_path']}")
    if metadata["image_path"]:
        print(f"image: {metadata['image_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
