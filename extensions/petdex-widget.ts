import {
	type Component,
	Container,
	getCapabilities,
	Image,
	type ImageProtocol,
	setCapabilities,
	type TerminalCapabilities,
	Text,
} from "@earendil-works/pi-tui";
import type { NativePetdexFrame } from "./petdex-native-renderer.ts";
import type { RenderSize } from "./petdex-renderer.ts";

export interface NativeImageBudget {
	maxWidthCells: number;
	maxHeightCells: number;
}

export interface NativePetWidgetOptions {
	frame: NativePetdexFrame;
	imageId: number;
	size: RenderSize;
	statusLines: string[];
	meterLine: string;
	terminalRows?: number;
}

export interface TextPetWidgetOptions {
	lines: string[];
}

export function supportsNativeImagePets(protocol: ImageProtocol = getCapabilities().images): boolean {
	return protocol === "kitty" || protocol === "iterm2";
}

export function setNativeImageCapabilitiesForTests(caps: TerminalCapabilities): void {
	setCapabilities(caps);
}

export function nativeImageBudget(size: RenderSize, terminalRows = process.stdout.rows || 24): NativeImageBudget {
	const statusRows = 3;
	const freeRows = Math.max(6, terminalRows - statusRows - 6);
	const preferredRows = size === "large" ? 14 : 10;
	const preferredColumns = size === "large" ? 42 : 28;
	return {
		maxWidthCells: preferredColumns,
		maxHeightCells: Math.max(6, Math.min(preferredRows, freeRows)),
	};
}

export function buildNativePetWidget(options: NativePetWidgetOptions): Component {
	const budget = nativeImageBudget(options.size, options.terminalRows);
	const widget = new Container();
	widget.addChild(
		new Image(
			options.frame.base64,
			"image/png",
			{ fallbackColor: (text) => text },
			{
				...budget,
				filename: options.frame.filename,
				imageId: options.imageId,
			},
			{ widthPx: options.frame.width, heightPx: options.frame.height },
		),
	);
	for (const line of options.statusLines) widget.addChild(new Text(line, 1, 0));
	widget.addChild(new Text(options.meterLine, 1, 0));
	return widget;
}

export function buildTextPetWidget(options: TextPetWidgetOptions): Component {
	const widget = new Container();
	for (const line of options.lines) widget.addChild(new Text(line, 1, 0));
	return widget;
}
