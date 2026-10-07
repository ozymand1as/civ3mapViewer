/**
 * Improvements, features and resources drawn on top of terrain.
 */

import { DIRECTIONS, directionScreenDelta, tileToWorld } from './iso.js';
import { resourceColor } from '../rules.js';

const IMPROVEMENT_GLYPHS = {
	mine: 'M',
	irrigation: 'I',
	fortress: 'F',
	barricade: 'B',
	airfield: 'A',
	radarTower: 'R',
	outpost: 'O',
};

const FEATURE_GLYPHS = {
	goodyHut: '?',
	barbarianCamp: '✖',
	pollution: '☣',
	craters: '⌾',
	ruins: '⌗',
};

/** Draw roads/railroads as connected half-segments towards like neighbours. */
export function drawRoutes(ctx, tile, tileW, getTile, kind) {
	if (!tile.improvements[kind]) return;
	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	ctx.strokeStyle = kind === 'railroad' ? '#4a4a4a' : '#8a6a43';
	ctx.lineWidth = Math.max(1, tileW * (kind === 'railroad' ? 0.075 : 0.06));
	ctx.lineCap = 'butt';
	for (let i = 0; i < 8; i++) {
		const d = DIRECTIONS[i];
		const neighbour = getTile(tile.x + d.dx, tile.y + d.dy);
		if (!neighbour || !neighbour.improvements[kind]) continue;
		const delta = directionScreenDelta(i, tileW);
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(cx + delta.dx / 2, cy + delta.dy / 2);
		ctx.stroke();
	}
}

/** Improvement/feature glyphs centred on the tile. */
export function drawGlyphs(ctx, tile, tileW, layers) {
	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	const size = Math.max(5, Math.round(tileW * 0.28));
	ctx.font = `bold ${size}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const glyphs = [];
	for (const [key, glyph] of Object.entries(IMPROVEMENT_GLYPHS)) {
		if (tile.improvements[key] && layers[key]) glyphs.push([glyph, '#3b3b3b']);
	}
	for (const [key, glyph] of Object.entries(FEATURE_GLYPHS)) {
		if (tile.features[key]) glyphs.push([glyph, key === 'pollution' ? '#c0392b' : '#3b3b3b']);
	}

	glyphs.forEach(([glyph, color], index) => {
		const offset = (index - (glyphs.length - 1) / 2) * size * 0.9;
		ctx.fillStyle = color;
		ctx.fillText(glyph, cx + offset, cy);
	});

	if (tile.features.snowCapped) {
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		ctx.beginPath();
		ctx.arc(cx, cy - tileW * 0.12, tileW * 0.12, 0, Math.PI * 2);
		ctx.fill();
	}
	if (tile.features.pineForest) {
		ctx.fillStyle = 'rgba(20,70,30,0.8)';
		ctx.beginPath();
		ctx.moveTo(cx, cy - tileW * 0.2);
		ctx.lineTo(cx + tileW * 0.12, cy + tileW * 0.05);
		ctx.lineTo(cx - tileW * 0.12, cy + tileW * 0.05);
		ctx.closePath();
		ctx.fill();
	}
	if (tile.features.bonusShield) {
		ctx.strokeStyle = 'rgba(255,255,255,0.75)';
		ctx.lineWidth = Math.max(1, tileW * 0.03);
		ctx.beginPath();
		ctx.moveTo(cx - tileW * 0.1, cy + tileW * 0.16);
		ctx.lineTo(cx + tileW * 0.1, cy + tileW * 0.16);
		ctx.stroke();
	}
}

/** Resource dot plus initials, coloured by resource category. */
export function drawResource(ctx, tile, tileW, resourceType) {
	if (!tile.resource) return;
	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	const r = Math.max(2, tileW * 0.11);
	ctx.fillStyle = resourceColor(resourceType);
	ctx.beginPath();
	ctx.arc(cx, cy + tileW * 0.2, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0,0,0,0.5)';
	ctx.lineWidth = 1;
	ctx.stroke();

	if (tileW >= 26) {
		const initials = tile.resource.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
		ctx.fillStyle = '#1c1c1c';
		ctx.font = `bold ${Math.max(5, Math.round(tileW * 0.22))}px system-ui, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(initials, cx, cy + tileW * 0.2);
	}
}
