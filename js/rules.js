/**
 * Default palettes used when rendering. No original Civ3 art is bundled: the
 * terrain palette is a set of flat colours, and the player palette is
 * OpenCiv3's MIT-licensed "modern" palette (C7/Lua/standalone/textures.lua).
 */

/**
 * Approximate flat colours keyed by terrain key (see Appendix B).
 * `overlay: true` means the terrain is normally drawn over a base terrain
 * (forest/jungle/marsh) rather than as a base fill.
 * @type {Record<string, {fill: string, stroke?: string, overlay?: boolean, glyph?: string, water?: boolean}>}
 */
export const TERRAIN_STYLE = {
	'desert': { fill: '#e6d69b' },
	'plains': { fill: '#c9b877' },
	'grassland': { fill: '#7fb45c' },
	'tundra': { fill: '#cfd6cf' },
	'flood plain': { fill: '#ded08a' },
	'hills': { fill: '#a99b60', glyph: '^' },
	'mountains': { fill: '#9a9a94', glyph: '▲' },
	'forest': { fill: '#4f8a4a', overlay: true, glyph: '♣' },
	'jungle': { fill: '#2f7a3f', overlay: true, glyph: '♣' },
	'marsh': { fill: '#6c8c6a', overlay: true, glyph: '~' },
	'volcano': { fill: '#6b5a55', glyph: '▲' },
	'coast': { fill: '#6fb3d9', water: true },
	'sea': { fill: '#3f7fc0', water: true },
	'ocean': { fill: '#245a95', water: true },
};

/** Fallback when a ruleset uses a terrain key we have no colour for. */
export const TERRAIN_FALLBACK = { fill: '#888888' };

export function terrainStyle(key) {
	return TERRAIN_STYLE[key] ?? TERRAIN_FALLBACK;
}

/**
 * 32-colour player palette (OpenCiv3 standalone palette, MIT).
 * Index matches Civ3 `primaryColorIndex` / `LEAD.Color`.
 */
export const PLAYER_COLORS = [
	'#F0F8FF', '#E6194B', '#F58231', '#FFE119', '#3CB44B', '#4363D8', '#000075',
	'#FABED4', '#911EB4', '#9A6324', '#AAFFC3', '#42D4F4', '#F032E6', '#808000',
	'#DCBEFF', '#A9A9A9', '#008080', '#FFD700', '#800000', '#00FF00', '#FFC0CB',
	'#4682B4', '#D2B48C', '#FF7F50', '#6A5ACD', '#2E8B57', '#DAA520', '#C71585',
	'#556B2F', '#8B4513', '#B0C4DE', '#696969',
];

export function playerColor(index) {
	if (!Number.isFinite(index) || index < 0) return '#cccccc';
	return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** A readable outline colour for a hex fill (black or white by luminance). */
export function contrastingOutline(hex) {
	const rgb = hexToRgb(hex);
	const luma = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
	return luma > 0.6 ? '#222222' : '#f5f5f5';
}

export function hexToRgb(hex) {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Resource dot colour by category (Civ3 GOOD.Type: 0 bonus, 1 strategic, 2 luxury). */
export function resourceColor(type) {
	switch (type) {
		case 1: return '#eb5757'; // strategic
		case 2: return '#bb6bd9'; // luxury
		default: return '#f2c94c'; // bonus
	}
}
