/**
 * Hover tooltip and pinned tile panel.
 */

import { playerColor } from '../rules.js';

export function setupTooltip(state, renderer) {
	const el = document.getElementById('tooltip');
	const pinnedEl = document.getElementById('pinned-panel');
	if (!el) return { show() {}, hide() {}, clearPinned() {} };

	function terrainName(world, key) {
		const t = world.rules.terrains.find((x) => x.key === key);
		return t?.name ?? key;
	}

	function ownerName(world, id) {
		if (id < 0) return 'unowned';
		const p = world.players.find((x) => x.id === id);
		return p ? `P${p.id} ${p.civName}` : `player ${id}`;
	}

	function buildHtml(tile) {
		const world = state.world;
		const lines = [];
		lines.push(`<h4>Tile ${tile.x}, ${tile.y}</h4>`);
		lines.push(`<div class="kv"><dt>Terrain</dt><dd>${terrainName(world, tile.baseTerrain)}${
			tile.overlayTerrain !== tile.baseTerrain ? ` / ${terrainName(world, tile.overlayTerrain)}` : ''
		}</dd></div>`);
		if (tile.resource) lines.push(`<div class="kv"><dt>Resource</dt><dd>${tile.resource}</dd></div>`);
		lines.push(`<div class="kv"><dt>Continent</dt><dd>${tile.continent}</dd></div>`);
		lines.push(`<div class="kv"><dt>Owner</dt><dd>${ownerName(world, tile.owner)}</dd></div>`);

		const improvements = Object.entries(tile.improvements)
			.filter(([, v]) => v)
			.map(([k]) => k);
		if (improvements.length) lines.push(`<div class="kv"><dt>Improvements</dt><dd>${improvements.join(', ')}</dd></div>`);

		const features = Object.entries(tile.features)
			.filter(([, v]) => v)
			.map(([k]) => k);
		if (features.length) lines.push(`<div class="kv"><dt>Features</dt><dd>${features.join(', ')}</dd></div>`);

		if (tile.freshWater) lines.push('<div class="kv"><dt>Fresh water</dt><dd>yes</dd></div>');
		if (tile.riverEdges) lines.push(`<div class="kv"><dt>River edges</dt><dd>${riverEdges(tile.riverEdges)}</dd></div>`);

		if (tile.exploredBy.length) {
			lines.push(`<div class="kv"><dt>Explored by</dt><dd>${tile.exploredBy.map((id) => `P${id}`).join(', ')}</dd></div>`);
		}
		if (tile.visibleTo.length) {
			lines.push(`<div class="kv"><dt>Visible to</dt><dd>${tile.visibleTo.map((id) => `P${id}`).join(', ')}</dd></div>`);
		}

		const city = world.cities.find((c) => c.x === tile.x && c.y === tile.y);
		if (city) {
			lines.push('<hr />');
			lines.push(`<h4>${escapeHtml(city.name)}</h4>`);
			lines.push(`<div class="kv"><dt>Owner</dt><dd>${ownerName(world, city.owner)}</dd></div>`);
			lines.push(`<div class="kv"><dt>Size</dt><dd>${city.size}</dd></div>`);
			if (city.producing) lines.push(`<div class="kv"><dt>Producing</dt><dd>${escapeHtml(city.producing)}</dd></div>`);
			if (city.capital) lines.push('<div class="kv"><dt>Status</dt><dd>Capital</dd></div>');
			if (city.civilDisorder) lines.push('<div class="kv"><dt>Status</dt><dd>Civil disorder</dd></div>');
			if (city.weLoveTheKingDay) lines.push('<div class="kv"><dt>Status</dt><dd>We love the King day</dd></div>');
			if (city.buildings?.length) {
				lines.push(`<div class="kv"><dt>Buildings</dt><dd>${city.buildings.map((b) => escapeHtml(b.name)).join(', ')}</dd></div>`);
			}
		}

		const units = world.units.filter((u) => u.x === tile.x && u.y === tile.y);
		if (units.length) {
			lines.push('<hr />');
			lines.push(`<h4>${units.length} unit${units.length > 1 ? 's' : ''}</h4>`);
			for (const u of units.slice(0, 12)) {
				const player = world.players.find((p) => p.id === u.owner);
				lines.push(
					`<div class="unit-row"><span class="swatch" style="background:${playerColor(player?.primaryColor ?? 0)}"></span>` +
					`${escapeHtml(u.prototype)}${u.name && u.name !== u.prototype ? ` “${escapeHtml(u.name)}”` : ''}` +
					` <span class="muted">hp ${u.hp}${u.fortified ? ', fortified' : ''}</span></div>`
				);
			}
			if (units.length > 12) lines.push(`<div class="muted">…and ${units.length - 12} more</div>`);
		}
		return lines.join('');
	}

	function riverEdges(mask) {
		const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
		return names.filter((_, i) => mask & (1 << i)).join(' ');
	}

	function position(evt, element) {
		const pad = 14;
		const rect = element.getBoundingClientRect();
		let left = evt.clientX + pad;
		let top = evt.clientY + pad;
		if (left + rect.width > window.innerWidth) left = evt.clientX - rect.width - pad;
		if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - pad;
		element.style.left = `${Math.max(4, left)}px`;
		element.style.top = `${Math.max(4, top)}px`;
	}

	return {
		show(tile, evt) {
			el.innerHTML = buildHtml(tile);
			el.classList.add('visible');
			position(evt, el);
		},
		move(evt) {
			if (el.classList.contains('visible')) position(evt, el);
		},
		hide() {
			el.classList.remove('visible');
		},
		renderPinned() {
			if (!pinnedEl) return;
			if (!state.pinned) {
				pinnedEl.innerHTML = '<p class="muted small">Click a tile to pin its details, or press Esc to clear.</p>';
				return;
			}
			pinnedEl.innerHTML = buildHtml(state.pinned);
		},
		buildHtml,
	};
}

function escapeHtml(text) {
	return String(text).replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}
