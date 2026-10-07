/**
 * Terrain painting: flat-colour diamonds with a light procedural texture, so
 * the map reads without any bundled Civ3 art.
 */

import { terrainStyle } from '../rules.js';
import { pathDiamond, tileToWorld } from './iso.js';

const OVERLAY_INSET = 0.18;

/**
 * Draw one tile's terrain into `ctx` (which is already transformed to world
 * space). `detail` grows with zoom: 0 = flat fill, 1 = glyphs/texture.
 */
export function drawTerrain(ctx, tile, tileW, detail) {
	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	const base = terrainStyle(tile.baseTerrain);

	pathDiamond(ctx, cx, cy, tileW);
	ctx.fillStyle = base.fill;
	ctx.fill();

	// Overlay terrain (forest/jungle/marsh) sits on top of the base.
	const overlay = tile.overlayTerrain;
	if (overlay && overlay !== tile.baseTerrain && detail > 0.2) {
		const style = terrainStyle(overlay);
		if (style.overlay) {
			pathDiamond(ctx, cx, cy, tileW, tileW * OVERLAY_INSET);
			ctx.fillStyle = style.fill;
			ctx.globalAlpha = 0.9;
			ctx.fill();
			ctx.globalAlpha = 1;
		}
	}

	// A faint darker lower half gives the tiles a little shape.
	if (detail > 0.5) {
		ctx.save();
		pathDiamond(ctx, cx, cy, tileW, tileW * 0.06);
		ctx.clip();
		ctx.fillStyle = 'rgba(0,0,0,0.05)';
		ctx.fillRect(cx - tileW / 2, cy, tileW, tileW / 2);
		ctx.restore();
	}
}

/**
 * Glyphs for hills/mountains/forest drawn above the terrain fill. Called after
 * all terrain fills so glyphs are not clipped by later tiles.
 */
export function drawTerrainGlyph(ctx, tile, tileW) {
	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	const style = terrainStyle(tile.overlayTerrain !== tile.baseTerrain ? tile.overlayTerrain : tile.baseTerrain);
	const glyph = style.glyph;
	if (!glyph) return;
	ctx.fillStyle = 'rgba(0,0,0,0.45)';
	ctx.font = `${Math.max(6, Math.round(tileW * 0.34))}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(glyph, cx, cy + tileW * 0.02);
}
