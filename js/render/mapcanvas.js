/**
 * Layered canvas renderer with viewport culling and horizontal/vertical wrap.
 *
 * All drawing is done in "world pixels" (tile geometry at the current zoom);
 * panning is a canvas translate, so line widths and font sizes stay in pixels.
 */

import { pathDiamond, tileToWorld, worldToTile } from './iso.js';
import { drawTerrain, drawTerrainGlyph } from './terrain.js';
import { drawRivers } from './rivers.js';
import { drawGlyphs, drawResource, drawRoutes } from './overlays.js';
import { drawCities } from './cities.js';
import { drawUnitStacks, stackUnits } from './units.js';
import { playerColor, terrainStyle } from '../rules.js';
import { RIVER_EDGES } from '../model.js';

export class MapRenderer {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {ReturnType<import('../state.js').createState>} state
	 */
	constructor(canvas, state) {
		this.canvas = canvas;
		this.state = state;
		this.ctx = canvas.getContext('2d');
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.dirty = true;
	}

	setWorld(world) {
		this.state.world = world;
		this.fit();
	}

	/** Fit the whole map into the viewport. */
	fit() {
		const world = this.state.world;
		if (!world || !world.width) return;
		const { width: cw, height: ch } = this.cssSize();
		const mapWorldW = world.width * 28; // map pixel width at tileW 56
		const mapWorldH = world.height * 14;
		const scale = Math.min((cw * 0.9) / mapWorldW, (ch * 0.9) / mapWorldH);
		this.state.view.tileW = clamp(56 * scale, 6, 160);
		this.centerOn(world.width / 2, world.height / 2);
	}

	centerOn(tx, ty) {
		const { width: cw, height: ch } = this.cssSize();
		const p = tileToWorld(tx, ty, this.state.view.tileW);
		this.state.view.offsetX = cw / 2 - p.x;
		this.state.view.offsetY = ch / 2 - p.y;
	}

	cssSize() {
		return { width: this.canvas.clientWidth || 800, height: this.canvas.clientHeight || 600 };
	}

	// ---- Interaction ----------------------------------------------------

	pan(dx, dy) {
		this.state.view.offsetX += dx;
		this.state.view.offsetY += dy;
		this.dirty = true;
	}

	/** Zoom keeping the tile under (sx, sy) fixed. */
	zoomAt(sx, sy, factor) {
		const view = this.state.view;
		const before = this.screenToWorld(sx, sy);
		view.tileW = clamp(view.tileW * factor, 6, 220);
		const after = worldToTile(before.x, before.y, view.tileW);
		const p = tileToWorld(after.x, after.y, view.tileW);
		view.offsetX = sx - p.x;
		view.offsetY = sy - p.y;
		this.dirty = true;
	}

	screenToWorld(sx, sy) {
		return { x: sx - this.state.view.offsetX, y: sy - this.state.view.offsetY };
	}

	/** Nearest real tile under a CSS-pixel point, or null. */
	getTileAtScreen(sx, sy) {
		const world = this.state.world;
		if (!world) return null;
		const w = this.screenToWorld(sx, sy);
		const t = worldToTile(w.x, w.y, this.state.view.tileW);
		let best = null;
		let bestDist = Infinity;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const x = Math.round(t.x) + dx;
				const y = Math.round(t.y) + dy;
				if (((x + y) % 2 + 2) % 2 !== 0) continue;
				const tile = this.getTile(x, y);
				if (!tile) continue;
				const p = tileToWorld(tile.x, tile.y, this.state.view.tileW);
				const dist = (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
				if (dist < bestDist) {
					bestDist = dist;
					best = tile;
				}
			}
		}
		return best;
	}

	/** Tile lookup honouring wrap, or null when out of bounds and not wrapped. */
	getTile(x, y) {
		const world = this.state.world;
		if (!world) return null;
		let tx = x;
		let ty = y;
		if (world.wrapX) tx = ((x % world.width) + world.width) % world.width;
		else if (x < 0 || x >= world.width) return null;
		if (world.wrapY) ty = ((y % world.height) + world.height) % world.height;
		else if (y < 0 || y >= world.height) return null;
		return world.tiles[ty * world.width + tx] ?? null;
	}

	// ---- Rendering ------------------------------------------------------

	resize() {
		const { width: cw, height: ch } = this.cssSize();
		this.canvas.width = Math.max(1, Math.round(cw * this.dpr));
		this.canvas.height = Math.max(1, Math.round(ch * this.dpr));
		this.dirty = true;
	}

	render() {
		const world = this.state.world;
		const { width: cw, height: ch } = this.cssSize();
		const ctx = this.ctx;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, cw, ch);
		ctx.fillStyle = '#0b1220';
		ctx.fillRect(0, 0, cw, ch);
		if (!world) return;

		const view = this.state.view;
		const tileW = view.tileW;
		const layers = this.state.layers;
		ctx.save();
		ctx.translate(view.offsetX, view.offsetY);

		const copies = this.#wrapCopies(tileW, cw, ch);
		const detail = clamp((tileW - 10) / 40, 0, 1);

		for (const copy of copies) {
			this.#drawCopy(ctx, copy, tileW, detail, layers);
		}

		// Dynamic layers (drawn after all terrain so they are never occluded).
		if (layers.cities) {
			for (const city of world.cities) this.#drawCityIfVisible(ctx, city, tileW, layers, copies);
		}
		if (layers.units && world.units.length) {
			const stacks = stackUnits(world);
			for (const [key, stack] of stacks) {
				const x = key % world.width;
				const y = (key / world.width) | 0;
				if (!this.#inAnyCopy(x, y, copies)) continue;
				drawUnitStacks(ctx, world, new Map([[key, stack]]), tileW, layers, this.state.visibility);
			}
		}

		ctx.restore();
		this.dirty = false;
	}

	#wrapCopies(tileW, cw, ch) {
		const world = this.state.world;
		const xs = world.wrapX ? [-1, 0, 1] : [0];
		const ys = world.wrapY ? [-1, 0, 1] : [0];
		const copies = [];
		for (const kx of xs) {
			for (const ky of ys) {
				const range = this.#visibleRange(tileW, cw, ch, kx * world.width, ky * world.height);
				if (range) copies.push({ kx, ky, ...range });
			}
		}
		return copies.length ? copies : [{ kx: 0, ky: 0, x0: 0, x1: -1, y0: 0, y1: -1 }];
	}

	/** Visible tile range for a wrapped copy whose base is offset by (dx, dy). */
	#visibleRange(tileW, cw, ch, dx, dy) {
		const world = this.state.world;
		const view = this.state.view;
		const corners = [[0, 0], [cw, 0], [0, ch], [cw, ch]];
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const [sx, sy] of corners) {
			const w = this.screenToWorld(sx, sy);
			const t = worldToTile(w.x, w.y, tileW);
			const x = t.x - dx;
			const y = t.y - dy;
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		const x0 = Math.max(0, Math.floor(minX) - 2);
		const y0 = Math.max(0, Math.floor(minY) - 2);
		const x1 = Math.min(world.width - 1, Math.ceil(maxX) + 2);
		const y1 = Math.min(world.height - 1, Math.ceil(maxY) + 2);
		if (x0 > x1 || y0 > y1) return null;
		return { x0, x1, y0, y1 };
	}

	#inAnyCopy(x, y, copies) {
		for (const c of copies) {
			if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return true;
		}
		return false;
	}

	#drawCopy(ctx, copy, tileW, detail, layers) {
		const world = this.state.world;
		const { kx, ky } = copy;
		const dx = kx * world.width;
		const dy = ky * world.height;
		// Screen offset of the copy.
		const origin = tileToWorld(dx, dy, tileW);
		ctx.save();
		ctx.translate(origin.x, origin.y);

		const dMin = copy.x0 + copy.y0;
		const dMax = copy.x1 + copy.y1;
		const baseTiles = [];

		for (let d = dMin; d <= dMax; d++) {
			for (let x = copy.x0; x <= copy.x1; x++) {
				const y = d - x;
				if (y < copy.y0 || y > copy.y1) continue;
				const tile = this.getTile(x, y);
				if (!tile) continue;
				baseTiles.push(tile);
				const vis = this.visibilityFor(tile);
				if (!vis.show) continue;
				ctx.globalAlpha = vis.alpha;
				if (layers.terrain) drawTerrain(ctx, tile, tileW, detail);
				else {
					pathDiamond(ctx, tileToWorld(tile.x, tile.y, tileW).x, tileToWorld(tile.x, tile.y, tileW).y, tileW);
					ctx.fillStyle = '#1c2a44';
					ctx.fill();
				}
				if (layers.continents && tile.continent >= 0) {
					ctx.globalAlpha = vis.alpha * 0.18;
					ctx.fillStyle = continentColor(tile.continent);
					ctx.fill();
				}
				ctx.globalAlpha = 1;
			}
		}

		// Second pass: glyphs and lines, so they are not clipped by later fills.
		for (const tile of baseTiles) {
			const vis = this.visibilityFor(tile);
			if (!vis.show) continue;
			ctx.globalAlpha = vis.alpha;
			if (layers.terrain && detail > 0.3) drawTerrainGlyph(ctx, tile, tileW);
			if (layers.rivers) drawRivers(ctx, tile, tileW);
			if (layers.roads) drawRoutes(ctx, tile, tileW, (x, y) => this.getTile(x, y), 'road');
			if (layers.railroads) drawRoutes(ctx, tile, tileW, (x, y) => this.getTile(x, y), 'railroad');
			if (layers.resources) {
				const type = resourceTypeFor(world, tile.resource);
				drawResource(ctx, tile, tileW, type);
			}
			drawGlyphs(ctx, tile, tileW, layers);
			if (layers.startingLocations && tile.features.playerStart) drawStartMarker(ctx, tile, tileW);
			if (layers.grid) {
				const p = tileToWorld(tile.x, tile.y, tileW);
				pathDiamond(ctx, p.x, p.y, tileW);
				ctx.strokeStyle = 'rgba(0,0,0,0.18)';
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			if (layers.coordinates && tileW >= 40) {
				const p = tileToWorld(tile.x, tile.y, tileW);
				ctx.fillStyle = 'rgba(0,0,0,0.45)';
				ctx.font = `${Math.round(tileW * 0.16)}px system-ui, sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(`${tile.x},${tile.y}`, p.x, p.y - tileW * 0.02);
			}
			if (layers.fog && this.state.visibility.mode === 'compare') {
				const tint = this.compareTint(tile);
				if (tint) {
					const p = tileToWorld(tile.x, tile.y, tileW);
					pathDiamond(ctx, p.x, p.y, tileW);
					ctx.globalAlpha = 0.4;
					ctx.fillStyle = tint;
					ctx.fill();
				}
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
	}

	#drawCityIfVisible(ctx, city, tileW, layers, copies) {
		if (city.x < 0 || city.y < 0) return;
		if (!this.#inAnyCopy(city.x, city.y, copies)) return;
		const tile = this.state.world.tiles[city.y * this.state.world.width + city.x];
		if (!tile) return;
		const vis = this.visibilityFor(tile);
		if (!vis.show) return;
		ctx.save();
		drawCities(ctx, this.state.world, city, tileW, layers, this.state.visibility);
		ctx.restore();
	}

	/**
	 * Resolve a tile's fog state for the selected view.
	 * @returns {{show: boolean, alpha: number}}
	 */
	visibilityFor(tile) {
		const layers = this.state.layers;
		const v = this.state.visibility;
		if (!layers.fog || v.mode === 'god') return { show: true, alpha: 1 };
		if (v.mode === 'allExplored') {
			const explored = tile.exploredBy.length > 0;
			return { show: explored, alpha: 1 };
		}
		if (v.mode === 'compare') {
			const explored = tile.exploredBy.length > 0;
			return { show: explored, alpha: 1 };
		}
		// Single-player view.
		const player = v.player;
		if (!tile.exploredBy.includes(player)) return { show: false, alpha: 0 };
		if (tile.visibleTo.includes(player)) return { show: true, alpha: 1 };
		return { show: true, alpha: v.fogDim };
	}

	compareTint(tile) {
		const compare = this.state.visibility.compare ?? [];
		for (const id of compare) {
			if (tile.visibleTo.includes(id) || tile.exploredBy.includes(id)) {
				const player = this.state.world.players.find((p) => p.id === id);
				return playerColor(player ? player.primaryColor : id);
			}
		}
		return null;
	}
}

function resourceTypeFor(world, key) {
	if (!key) return 0;
	const resource = world.rules.resources.find((r) => r.key === key || r.name === key);
	return resource?.type ?? 0;
}

function continentColor(index) {
	const hue = (index * 47) % 360;
	return `hsl(${hue} 60% 50%)`;
}

function drawStartMarker(ctx, tile, tileW) {
	const p = tileToWorld(tile.x, tile.y, tileW);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = Math.max(1, tileW * 0.04);
	ctx.beginPath();
	ctx.arc(p.x, p.y, tileW * 0.26, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	ctx.beginPath();
	ctx.arc(p.x, p.y, tileW * 0.08, 0, Math.PI * 2);
	ctx.fill();
}

export function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

export { RIVER_EDGES, terrainStyle };
