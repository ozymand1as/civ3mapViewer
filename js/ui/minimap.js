/**
 * Minimap: a downscaled rectangular view of the map with a viewport
 * rectangle; click or drag to navigate.
 */

import { terrainStyle, playerColor } from '../rules.js';

export function setupMinimap(state, renderer, onChange) {
	const canvas = document.getElementById('minimap');
	if (!canvas) return { render() {} };
	const ctx = canvas.getContext('2d');
	let dragging = false;

	function draw() {
		const world = state.world;
		const rect = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (canvas.width !== Math.round(rect.width * dpr)) {
			canvas.width = Math.max(1, Math.round(rect.width * dpr));
			canvas.height = Math.max(1, Math.round(rect.height * dpr));
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, rect.width, rect.height);
		if (!world) return;

		const cw = rect.width;
		const ch = rect.height;
		const px = cw / world.width;
		const py = ch / world.height;

		for (const tile of world.tiles) {
			if (!tile) continue;
			const vis = renderer.visibilityFor(tile);
			if (!vis.show) continue;
			const style = terrainStyle(tile.baseTerrain);
			ctx.fillStyle = style.fill;
			ctx.fillRect(tile.x * px, tile.y * py, Math.max(1, px), Math.max(1, py));
		}
		for (const city of world.cities) {
			const player = world.players.find((p) => p.id === city.owner);
			ctx.fillStyle = playerColor(player?.primaryColor ?? 0);
			ctx.fillRect(city.x * px - 1, city.y * py - 1, Math.max(2, px + 1), Math.max(2, py + 1));
		}

		// Viewport rectangle from the renderer's visible tile bounds at the centre.
		const { width: vw, height: vh } = renderer.cssSize();
		const originX = -state.view.offsetX;
		const originY = -state.view.offsetY;
		const tl = screenToTileFraction(originX, originY, state.view.tileW);
		const br = screenToTileFraction(originX + vw, originY + vh, state.view.tileW);
		const x0 = Math.min(tl.x, br.x);
		const x1 = Math.max(tl.x, br.x);
		const y0 = Math.min(tl.y, br.y);
		const y1 = Math.max(tl.y, br.y);
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.lineWidth = 1;
		ctx.strokeRect(x0 * px, y0 * py, (x1 - x0) * px, (y1 - y0) * py);
	}

	function screenToTileFraction(sx, sy, tileW) {
		// World coords are already screen minus offset here; inverse of tileToWorld.
		return { x: (2 * sx) / tileW, y: (4 * sy) / tileW };
	}

	function navigate(evt) {
		const world = state.world;
		if (!world) return;
		const rect = canvas.getBoundingClientRect();
		const tx = ((evt.clientX - rect.left) / rect.width) * world.width;
		const ty = ((evt.clientY - rect.top) / rect.height) * world.height;
		renderer.centerOn(tx, ty);
		onChange();
	}

	canvas.addEventListener('pointerdown', (e) => {
		dragging = true;
		canvas.setPointerCapture(e.pointerId);
		navigate(e);
	});
	canvas.addEventListener('pointermove', (e) => {
		if (dragging) navigate(e);
	});
	canvas.addEventListener('pointerup', (e) => {
		dragging = false;
		try {
			canvas.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	});

	return { render: draw };
}
