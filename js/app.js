/**
 * Bootstrap and wiring: worker-based parsing, canvas rendering, panels and
 * input handling.
 */

import { createState, saveVisibility } from './state.js';
import { MapRenderer } from './render/mapcanvas.js';
import { setupFileBar } from './ui/filebar.js';
import { setupLayers } from './ui/layers.js';
import { setupPlayers } from './ui/players.js';
import { setupTooltip } from './ui/tooltip.js';
import { setupMinimap } from './ui/minimap.js';

const state = createState();

const canvas = document.getElementById('map');
const renderer = new MapRenderer(canvas, state);
const tooltip = setupTooltip(state, renderer);

let minimap;
let layers;
let players;
let filebar;

const requestRender = () => {
	renderer.dirty = true;
	scheduleFrame();
};

let frameScheduled = false;
function scheduleFrame() {
	if (frameScheduled) return;
	frameScheduled = true;
	requestAnimationFrame(() => {
		frameScheduled = false;
		renderer.render();
		minimap?.render();
	});
}

// ---- Worker -------------------------------------------------------------

const worker = new Worker(new URL('./workers/parse.worker.js', import.meta.url), { type: 'module' });
let pendingFile = null;

worker.onmessage = (event) => {
	const msg = event.data ?? {};
	if (msg.type === 'progress') {
		filebar.showStatus(`Loading ${pendingFile?.name ?? ''}: ${msg.stage}${msg.detail ? ` — ${msg.detail}` : ''}…`);
		return;
	}
	if (msg.type === 'error') {
		state.status = 'error';
		filebar.showError(`Could not load the file: ${msg.message}`);
		console.error(msg.stack || msg.message);
		return;
	}
	if (msg.type === 'done') {
		state.world = msg.world;
		state.fileName = pendingFile?.name ?? '';
		state.status = 'ready';
		state.pinned = null;
		renderer.setWorld(msg.world);
		renderer.resize();
		refreshPanels();
		filebar.renderReport();
		tooltip.renderPinned();
		requestRender();
	}
};

function loadFile(file) {
	pendingFile = file;
	state.status = 'loading';
	filebar.showStatus(`Loading ${file.name}…`);
	file.arrayBuffer().then((buffer) => {
		worker.postMessage({ id: 1, buffer, name: file.name }, [buffer]);
	});
}

// ---- Panels -------------------------------------------------------------

function refreshPanels() {
	layers?.render();
	players?.render();
	tooltip.renderPinned();
}

layers = setupLayers(state, requestRender);
players = setupPlayers(state, requestRender);
minimap = setupMinimap(state, renderer, requestRender);

filebar = setupFileBar({
	onFile: loadFile,
	getReport: () => {
		const world = state.world;
		if (!world) return null;
		const real = world.tiles.filter(Boolean).length;
		const rows = [
			['File', state.fileName],
			['Type', world.source],
			['Version', world.version ? `${world.version.game} ${world.version.major}.${world.version.minor}` : '—'],
			['Map size', `${world.width} × ${world.height} (${real} tiles)`],
			['Wrapping', `${world.wrapX ? 'X' : '—'}${world.wrapY ? ' Y' : ''}`],
			['Turn', world.turn],
			['Year', formatYear(world.year)],
			['Seed', world.seed],
			['Players', world.players.length],
			['Cities', world.cities.length],
			['Units', world.units.length],
		];
		return {
			title: world.title || 'Load report',
			rows,
			warnings: world.warnings.map((w) => w.message),
		};
	},
});

function formatYear(year) {
	return year < 0 ? `${-year} BC` : `${year} AD`;
}

// ---- Input --------------------------------------------------------------

let panning = false;
let moved = false;
let last = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
	if (e.button !== 0) return;
	panning = true;
	moved = false;
	last = { x: e.clientX, y: e.clientY };
	canvas.setPointerCapture(e.pointerId);
	canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
	if (panning) {
		const dx = e.clientX - last.x;
		const dy = e.clientY - last.y;
		if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
		renderer.pan(dx, dy);
		last = { x: e.clientX, y: e.clientY };
		tooltip.hide();
		requestRender();
		return;
	}
	const tile = renderer.getTileAtScreen(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
	if (tile) tooltip.show(tile, e);
	else tooltip.hide();
});

canvas.addEventListener('pointerup', (e) => {
	if (!panning) return;
	panning = false;
	canvas.classList.remove('grabbing');
	try {
		canvas.releasePointerCapture(e.pointerId);
	} catch {
		/* ignore */
	}
	if (!moved) {
		const rect = canvas.getBoundingClientRect();
		const tile = renderer.getTileAtScreen(e.clientX - rect.left, e.clientY - rect.top);
		state.pinned = tile;
		tooltip.renderPinned();
	}
});

canvas.addEventListener('pointerleave', () => tooltip.hide());

canvas.addEventListener(
	'wheel',
	(e) => {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const factor = Math.exp(-e.deltaY * 0.0015);
		renderer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
		requestRender();
	},
	{ passive: false }
);

canvas.addEventListener('dblclick', (e) => {
	const rect = canvas.getBoundingClientRect();
	renderer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.6);
	requestRender();
});

window.addEventListener('keydown', (e) => {
	if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
	const { width: cw, height: ch } = renderer.cssSize();
	switch (e.key) {
		case 'f':
		case 'F':
			renderer.fit();
			requestRender();
			break;
		case '+':
		case '=':
			renderer.zoomAt(cw / 2, ch / 2, 1.25);
			requestRender();
			break;
		case '-':
			renderer.zoomAt(cw / 2, ch / 2, 0.8);
			requestRender();
			break;
		case 'Escape':
			state.pinned = null;
			tooltip.renderPinned();
			tooltip.hide();
			break;
		default:
			break;
	}
});

// ---- Toolbar buttons ----------------------------------------------------

document.getElementById('export-json')?.addEventListener('click', () => {
	if (!state.world) return;
	const json = JSON.stringify(state.world, (key, value) => (value === undefined ? null : value), 1);
	const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${(state.fileName || 'civ3-map').replace(/\.[^.]+$/, '')}.model.json`;
	anchor.click();
	URL.revokeObjectURL(url);
});

document.getElementById('fit-view')?.addEventListener('click', () => {
	renderer.fit();
	requestRender();
});
document.getElementById('zoom-in')?.addEventListener('click', () => {
	const { width, height } = renderer.cssSize();
	renderer.zoomAt(width / 2, height / 2, 1.25);
	requestRender();
});
document.getElementById('zoom-out')?.addEventListener('click', () => {
	const { width, height } = renderer.cssSize();
	renderer.zoomAt(width / 2, height / 2, 0.8);
	requestRender();
});
document.getElementById('export-png')?.addEventListener('click', () => {
	canvas.toBlob((blob) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${(state.fileName || 'civ3-map').replace(/\.[^.]+$/, '')}.png`;
		anchor.click();
		URL.revokeObjectURL(url);
	}, 'image/png');
});

const searchInput = document.getElementById('search-input');
function runSearch() {
	const query = searchInput?.value.trim().toLowerCase();
	if (!query || !state.world) return;
	const city = state.world.cities.find((c) => c.name.toLowerCase().includes(query));
	if (city) {
		renderer.centerOn(city.x, city.y);
		state.pinned = state.world.tiles[city.y * state.world.width + city.x] ?? null;
		tooltip.renderPinned();
		requestRender();
		return;
	}
	const unit = state.world.units.find((u) => (u.name || u.prototype).toLowerCase().includes(query));
	if (unit) {
		renderer.centerOn(unit.x, unit.y);
		requestRender();
	}
}
document.getElementById('search-button')?.addEventListener('click', runSearch);
searchInput?.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') runSearch();
});

// ---- Layout -------------------------------------------------------------

const resizeObserver = new ResizeObserver(() => {
	renderer.resize();
	requestRender();
});
resizeObserver.observe(canvas.parentElement ?? canvas);

window.addEventListener('resize', () => {
	renderer.resize();
	requestRender();
});

// Expose a tiny API for tests/debugging.
window.civ3viewer = {
	state,
	renderer,
	loadFile,
	loadBytes: (bytes, name) => loadFile(new File([bytes], name)),
	worker,
};

renderer.resize();
refreshPanels();
filebar.renderReport();
tooltip.renderPinned();
scheduleFrame();
