import { visibleWidth } from "@earendil-works/pi-tui";
import type { NativeSpriteFrame, SpriteAlign, SpriteRenderOptions } from "./renderer.ts";

const PLACEHOLDER = "\u{10EEEE}";
const RESET_FG_AND_UNDERLINE = "\u001b[39;59m";
const TMUX_PASSTHROUGH_PREFIX = "\u001bPtmux;";
const TMUX_PASSTHROUGH_SUFFIX = "\u001b\\";
const ROW_COLUMN_DIACRITICS = [
	"\u{305}",
	"\u{30D}",
	"\u{30E}",
	"\u{310}",
	"\u{312}",
	"\u{33D}",
	"\u{33E}",
	"\u{33F}",
	"\u{346}",
	"\u{34A}",
	"\u{34B}",
	"\u{34C}",
	"\u{350}",
	"\u{351}",
	"\u{352}",
	"\u{357}",
	"\u{35B}",
	"\u{363}",
	"\u{364}",
	"\u{365}",
	"\u{366}",
	"\u{367}",
	"\u{368}",
	"\u{369}",
	"\u{36A}",
	"\u{36B}",
	"\u{36C}",
	"\u{36D}",
	"\u{36E}",
	"\u{36F}",
	"\u{483}",
	"\u{484}",
	"\u{485}",
	"\u{486}",
	"\u{487}",
	"\u{592}",
	"\u{593}",
	"\u{594}",
	"\u{595}",
	"\u{597}",
	"\u{598}",
	"\u{599}",
	"\u{59C}",
	"\u{59D}",
	"\u{59E}",
	"\u{59F}",
	"\u{5A0}",
	"\u{5A1}",
	"\u{5A8}",
	"\u{5A9}",
	"\u{5AB}",
	"\u{5AC}",
	"\u{5AF}",
	"\u{5C4}",
	"\u{610}",
	"\u{611}",
	"\u{612}",
	"\u{613}",
	"\u{614}",
	"\u{615}",
	"\u{616}",
	"\u{617}",
	"\u{657}",
	"\u{658}",
	"\u{659}",
	"\u{65A}",
	"\u{65B}",
	"\u{65D}",
	"\u{65E}",
	"\u{6D6}",
	"\u{6D7}",
	"\u{6D8}",
	"\u{6D9}",
	"\u{6DA}",
	"\u{6DB}",
	"\u{6DC}",
	"\u{6DF}",
	"\u{6E0}",
	"\u{6E1}",
	"\u{6E2}",
	"\u{6E4}",
	"\u{6E7}",
	"\u{6E8}",
	"\u{6EB}",
	"\u{6EC}",
	"\u{730}",
	"\u{732}",
	"\u{733}",
	"\u{735}",
	"\u{736}",
	"\u{73A}",
	"\u{73D}",
	"\u{73F}",
	"\u{740}",
	"\u{741}",
	"\u{743}",
	"\u{745}",
	"\u{747}",
	"\u{749}",
	"\u{74A}",
	"\u{7EB}",
	"\u{7EC}",
	"\u{7ED}",
	"\u{7EE}",
	"\u{7EF}",
	"\u{7F0}",
	"\u{7F1}",
	"\u{7F3}",
	"\u{816}",
	"\u{817}",
	"\u{818}",
	"\u{819}",
	"\u{81B}",
	"\u{81C}",
	"\u{81D}",
	"\u{81E}",
	"\u{81F}",
	"\u{820}",
	"\u{821}",
	"\u{822}",
	"\u{823}",
	"\u{825}",
	"\u{826}",
	"\u{827}",
	"\u{829}",
	"\u{82A}",
	"\u{82B}",
	"\u{82C}",
	"\u{82D}",
	"\u{951}",
	"\u{953}",
	"\u{954}",
	"\u{F82}",
	"\u{F83}",
	"\u{F86}",
	"\u{F87}",
	"\u{135D}",
	"\u{135E}",
	"\u{135F}",
	"\u{17DD}",
	"\u{193A}",
	"\u{1A17}",
	"\u{1A75}",
	"\u{1A76}",
	"\u{1A77}",
	"\u{1A78}",
	"\u{1A79}",
	"\u{1A7A}",
	"\u{1A7B}",
	"\u{1A7C}",
	"\u{1B6B}",
	"\u{1B6D}",
	"\u{1B6E}",
	"\u{1B6F}",
	"\u{1B70}",
	"\u{1B71}",
	"\u{1B72}",
	"\u{1B73}",
	"\u{1CD0}",
	"\u{1CD1}",
	"\u{1CD2}",
	"\u{1CDA}",
	"\u{1CDB}",
	"\u{1CE0}",
	"\u{1DC0}",
	"\u{1DC1}",
	"\u{1DC3}",
	"\u{1DC4}",
	"\u{1DC5}",
	"\u{1DC6}",
	"\u{1DC7}",
	"\u{1DC8}",
	"\u{1DC9}",
	"\u{1DCB}",
	"\u{1DCC}",
	"\u{1DD1}",
	"\u{1DD2}",
	"\u{1DD3}",
	"\u{1DD4}",
	"\u{1DD5}",
	"\u{1DD6}",
	"\u{1DD7}",
	"\u{1DD8}",
	"\u{1DD9}",
	"\u{1DDA}",
	"\u{1DDB}",
	"\u{1DDC}",
	"\u{1DDD}",
	"\u{1DDE}",
	"\u{1DDF}",
	"\u{1DE0}",
	"\u{1DE1}",
	"\u{1DE2}",
	"\u{1DE3}",
	"\u{1DE4}",
	"\u{1DE5}",
	"\u{1DE6}",
	"\u{1DFE}",
	"\u{20D0}",
	"\u{20D1}",
	"\u{20D4}",
	"\u{20D5}",
	"\u{20D6}",
	"\u{20D7}",
	"\u{20DB}",
	"\u{20DC}",
	"\u{20E1}",
	"\u{20E7}",
	"\u{20E9}",
	"\u{20F0}",
	"\u{2CEF}",
	"\u{2CF0}",
	"\u{2CF1}",
	"\u{2DE0}",
	"\u{2DE1}",
	"\u{2DE2}",
	"\u{2DE3}",
	"\u{2DE4}",
	"\u{2DE5}",
	"\u{2DE6}",
	"\u{2DE7}",
	"\u{2DE8}",
	"\u{2DE9}",
	"\u{2DEA}",
	"\u{2DEB}",
	"\u{2DEC}",
	"\u{2DED}",
	"\u{2DEE}",
	"\u{2DEF}",
	"\u{2DF0}",
	"\u{2DF1}",
	"\u{2DF2}",
	"\u{2DF3}",
	"\u{2DF4}",
	"\u{2DF5}",
	"\u{2DF6}",
	"\u{2DF7}",
	"\u{2DF8}",
	"\u{2DF9}",
	"\u{2DFA}",
	"\u{2DFB}",
	"\u{2DFC}",
	"\u{2DFD}",
	"\u{2DFE}",
	"\u{2DFF}",
	"\u{A66F}",
	"\u{A67C}",
	"\u{A67D}",
	"\u{A6F0}",
	"\u{A6F1}",
	"\u{A8E0}",
	"\u{A8E1}",
	"\u{A8E2}",
	"\u{A8E3}",
	"\u{A8E4}",
	"\u{A8E5}",
] as const;

export interface TerminalGraphicsSink {
	write(sequence: string): void;
}

const stdoutSink: TerminalGraphicsSink = {
	write(sequence: string) {
		process.stdout.write(sequence);
	},
};

let graphicsSink: TerminalGraphicsSink = stdoutSink;
const uploadedImages = new Map<number, string>();
const virtualPlacements = new Set<string>();

export function setTerminalGraphicsSinkForTests(sink: TerminalGraphicsSink | undefined): void {
	graphicsSink = sink ?? stdoutSink;
	uploadedImages.clear();
	virtualPlacements.clear();
}

export function clearKittyPlaceholderCaches(): void {
	uploadedImages.clear();
	virtualPlacements.clear();
}

export function placeholderGlyph(): string {
	return PLACEHOLDER;
}

export function wrapTmuxPassthrough(sequence: string): string {
	return `${TMUX_PASSTHROUGH_PREFIX}${sequence.replaceAll("\u001b", "\u001b\u001b")}${TMUX_PASSTHROUGH_SUFFIX}`;
}

function isTmux(): boolean {
	const term = process.env.TERM?.toLowerCase() ?? "";
	return Boolean(process.env.TMUX || term.startsWith("tmux") || term.startsWith("screen"));
}

function kittySequence(sequence: string): string {
	return isTmux() ? wrapTmuxPassthrough(sequence) : sequence;
}

function paramSequence(params: string[], payload = ""): string {
	return `\u001b_G${params.join(",")};${payload}\u001b\\`;
}

export function encodeKittyPlaceholderUpload(frame: NativeSpriteFrame, imageId: number): string {
	const chunkSize = 4096;
	const params = ["a=t", "f=100", `i=${imageId}`, "q=2"];
	if (frame.base64.length <= chunkSize) return paramSequence(params, frame.base64);
	const chunks: string[] = [];
	for (let offset = 0; offset < frame.base64.length; offset += chunkSize) {
		const chunk = frame.base64.slice(offset, offset + chunkSize);
		const isFirst = offset === 0;
		const isLast = offset + chunkSize >= frame.base64.length;
		if (isFirst) chunks.push(paramSequence([...params, "m=1"], chunk));
		else chunks.push(paramSequence([`m=${isLast ? 0 : 1}`], chunk));
	}
	return chunks.join("");
}

export function encodeKittyVirtualPlacement(
	imageId: number,
	placementId: number,
	columns: number,
	rows: number,
): string {
	return paramSequence(["a=p", "U=1", `i=${imageId}`, `p=${placementId}`, `c=${columns}`, `r=${rows}`, "q=2"]);
}

function diacritic(index: number): string {
	const value = ROW_COLUMN_DIACRITICS[index];
	if (!value) throw new Error(`Kitty placeholder index ${index} exceeds supported diacritic table`);
	return value;
}

function foregroundForImageId(imageId: number): string {
	const low = imageId & 0xffffff;
	const r = (low >> 16) & 0xff;
	const g = (low >> 8) & 0xff;
	const b = low & 0xff;
	return `\u001b[38;2;${r};${g};${b}m`;
}

function placeholderPlacementId(imageId: number): number {
	return imageId & 0xffffff || 1;
}

function underlineForPlacementId(placementId: number): string {
	const low = placementId & 0xffffff;
	const r = (low >> 16) & 0xff;
	const g = (low >> 8) & 0xff;
	const b = low & 0xff;
	return `\u001b[58;2;${r};${g};${b}m`;
}

export function placeholderCell(row: number, column: number, imageId: number): string {
	const highByte = (imageId >>> 24) & 0xff;
	return `${PLACEHOLDER}${diacritic(row)}${diacritic(column)}${highByte ? diacritic(highByte) : ""}`;
}

function alignLine(line: string, width: number, align: SpriteAlign): string {
	if (align !== "right") return line;
	return `${" ".repeat(Math.max(0, width - visibleWidth(line) - 1))}${line}`;
}

export function placeholderGridLines(
	columns: number,
	rows: number,
	imageId: number,
	placementId = placeholderPlacementId(imageId),
): string[] {
	const prefix = `${foregroundForImageId(imageId)}${underlineForPlacementId(placementId)}`;
	return Array.from(
		{ length: rows },
		(_, row) =>
			`${prefix}${Array.from({ length: columns }, (_unused, column) => placeholderCell(row, column, imageId)).join("")}${RESET_FG_AND_UNDERLINE}`,
	);
}

export function uploadKittyPlaceholderFrame(
	frame: NativeSpriteFrame,
	imageId: number,
	columns: number,
	rows: number,
	options: { forceUpload?: boolean } = {},
): void {
	const imageKey = `${imageId}:${frame.base64}`;
	if (options.forceUpload || uploadedImages.get(imageId) !== imageKey) {
		graphicsSink.write(kittySequence(encodeKittyPlaceholderUpload(frame, imageId)));
		uploadedImages.set(imageId, imageKey);
	}
	const placementId = placeholderPlacementId(imageId);
	const placementKey = `${imageId}:${placementId}:${columns}:${rows}`;
	if (!virtualPlacements.has(placementKey)) {
		graphicsSink.write(kittySequence(encodeKittyVirtualPlacement(imageId, placementId, columns, rows)));
		virtualPlacements.add(placementKey);
	}
}

export class KittyPlaceholderSpriteWidget {
	private activeFrameUploaded = false;

	constructor(
		private readonly frames: NativeSpriteFrame[],
		private readonly activeFrameIndex: number,
		private readonly imageIds: number[],
		private readonly statusLine: string,
		private readonly configuredSize: { columns: number; rows: number },
		private readonly options: SpriteRenderOptions,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const columns = Math.max(1, Math.min(width - 2, this.configuredSize.columns));
		const rows = this.configuredSize.rows;
		const activeIndex = this.activeFrameIndex % Math.max(1, this.frames.length);
		const activeImageId = this.imageIds[activeIndex % this.imageIds.length] ?? this.imageIds[0] ?? 1;
		const activeFrame = this.frames[activeIndex];
		if (activeFrame && activeImageId && !this.activeFrameUploaded) {
			uploadKittyPlaceholderFrame(activeFrame, activeImageId, columns, rows, { forceUpload: true });
			this.activeFrameUploaded = true;
		}
		for (const [index, frame] of this.frames.entries()) {
			const imageId = this.imageIds[index] ?? this.imageIds[0];
			if (!imageId || index === activeIndex) continue;
			uploadKittyPlaceholderFrame(frame, imageId, columns, rows);
		}
		const align = this.options.align ?? "left";
		const lines = placeholderGridLines(columns, rows, activeImageId).map((line) => alignLine(line, width, align));
		if (!this.options.label) return lines;
		return [...lines, alignLine(this.statusLine, width, align)];
	}
}
