/**
 * OpenCiv3 JSON save importer (`SaveGame` schema).
 *
 * Reference: `OpenCiv3/C7Engine/C7GameData/Save/*.cs`. The JSON is camelCase,
 * pretty-printed, with default-valued fields omitted (so a missing field is
 * simply the type's default).
 */

import {
	createWorld, createTileGrid, createPlayer, addWarning, tileIndex,
} from '../model.js';
import { applyRulesDefaults } from './defaults.js';

const RIVER_FEATURE_BITS = {
	riverNorth: 0,
	riverNortheast: 1,
	riverEast: 2,
	riverSoutheast: 3,
	riverSouth: 4,
	riverSouthwest: 5,
	riverWest: 6,
	riverNorthwest: 7,
};

const FEATURE_KEYS = ['barbarianCamp', 'bonusShield', 'snowCapped', 'pineForest'];
const IMPROVEMENT_KEYS = ['road', 'railroad', 'mine', 'irrigation', 'fortress', 'barricade'];
const OVERLAY_FEATURES = new Set(['ruins', 'pollution', 'craters']);

/**
 * @param {string|object} input JSON text or already-parsed SaveGame
 * @param {string} sourceName
 * @returns {import('../model.js').WorldModel}
 */
export function parseOpenCiv3(input, sourceName) {
	const save = typeof input === 'string' ? JSON.parse(input) : input;
	if (!save || typeof save !== 'object') throw new Error('Not an OpenCiv3 save object.');

	const world = createWorld('openciv3-json', sourceName);
	world.rules = buildRules(save);
	applyRulesDefaults(world.rules);

	const map = save.map ?? {};
	const width = map.tilesWide ?? 0;
	const height = map.tilesTall ?? 0;
	if (!width || !height) throw new Error('OpenCiv3 save has no map dimensions.');

	world.width = width;
	world.height = height;
	world.wrapX = !!map.wrapHorizontally;
	world.wrapY = !!map.wrapVertically;
	world.seed = save.seed ?? 0;
	world.turn = save.turnNumber ?? 0;
	world.year = 0;

	const civs = save.civilizations ?? [];
	const civByName = new Map(civs.map((c) => [c.name, c]));

	world.players = (save.players ?? []).map((p) => {
		const id = parseId(p.id);
		const civ = civByName.get(p.civilization);
		const player = createPlayer(id);
		player.civName = civ?.name || p.civilization || `Player ${id + 1}`;
		player.adjective = civ?.adjective || '';
		player.leaderName = civ?.leader || '';
		player.primaryColor = p.primaryColorIndex ?? civ?.primaryColorIndex ?? id;
		player.human = !!p.human;
		player.alive = !p.defeated;
		player.barbarian = !!civ?.isBarbarian;
		player.gold = p.gold ?? 0;
		return player;
	});

	world.tiles = createTileGrid(width, height);
	for (const st of map.tiles ?? []) {
		const tile = world.tiles[tileIndex(st.x, st.y, width)];
		if (!tile) continue;
		tile.baseTerrain = st.baseTerrain || tile.baseTerrain;
		tile.overlayTerrain = st.overlayTerrain || tile.baseTerrain;
		tile.continent = st.continent ?? -1;
		tile.freshWater = !!st.isFreshWater;
		tile.resource = st.resource ?? null;

		for (const feature of st.features ?? []) {
			if (feature in RIVER_FEATURE_BITS) tile.riverEdges |= 1 << RIVER_FEATURE_BITS[feature];
			else if (FEATURE_KEYS.includes(feature)) tile.features[feature] = true;
		}
		for (const overlay of st.overlays ?? []) {
			if (IMPROVEMENT_KEYS.includes(overlay)) tile.improvements[overlay] = true;
			else if (OVERLAY_FEATURES.has(overlay)) tile.features[overlay] = true;
		}
	}

	// Visibility: `tileKnowledge` is the explored set (OpenCiv3 does not persist
	// per-tile unit vision), so explored and visible are the same list.
	for (const p of save.players ?? []) {
		const id = parseId(p.id);
		for (const loc of p.tileKnowledge ?? []) {
			const tile = world.tiles[tileIndex(loc.x, loc.y, width)];
			if (tile && !tile.exploredBy.includes(id)) tile.exploredBy.push(id);
		}
	}
	for (const tile of world.tiles) {
		if (tile) tile.visibleTo = tile.exploredBy.slice();
	}
	world.visibilityApproximated = true;

	world.cities = (save.cities ?? []).map((c) => {
		const loc = c.location ?? {};
		return {
			id: parseId(c.id),
			owner: parseId(c.owner),
			name: c.name || `City ${parseId(c.id)}`,
			x: loc.x ?? -1,
			y: loc.y ?? -1,
			size: c.size || c.residents?.length || 1,
			capital: !!c.capital,
			civilDisorder: false,
			weLoveTheKingDay: false,
			freshWater: false,
			producing: c.producible || '',
			buildings: (c.buildings ?? []).map((b) => ({
				name: b.building || '',
				year: b.year ?? 0,
				culture: b.totalCulture ?? 0,
			})),
		};
	});
	for (const city of world.cities) {
		if (city.x < 0) continue;
		const tile = world.tiles[tileIndex(city.x, city.y, width)];
		if (tile) tile.cityId = city.id;
	}

	world.units = (save.units ?? []).map((u) => {
		const loc = u.currentLocation ?? {};
		return {
			id: parseId(u.id),
			owner: parseId(u.owner),
			prototype: u.prototype || 'Unit',
			type: unitTypeKind(u.prototype, world.rules.unitTypes),
			name: u.name || u.prototype || 'Unit',
			x: loc.x ?? -1,
			y: loc.y ?? -1,
			experience: u.experience || 'regular',
			hp: u.hitPointsRemaining ?? 3,
			movementRemaining: u.movePointsRemaining ?? 0,
			fortified: u.action === 'fortified',
			automated: !!u.isAutomated,
			nationality: u.nationality || '',
		};
	});

	world.startingLocations = (map.startingLocations ?? [])
		.map((s) => world.tiles[tileIndex(s.x, s.y, width)])
		.filter(Boolean);
	for (const t of world.startingLocations) t.features.playerStart = true;

	if ((map.tiles ?? []).length === 0) addWarning(world, 'The OpenCiv3 save has no tiles.');

	return world;
}

function buildRules(save) {
	const terrains = (save.terrainTypes ?? []).map((t, index) => ({
		index,
		key: t.key ?? `terrain${index}`,
		name: t.displayName ?? t.key ?? `Terrain ${index}`,
	}));
	const resources = (save.resources ?? []).map((r, index) => ({
		index,
		key: r.key ?? r.name ?? `resource${index}`,
		name: r.name ?? r.key ?? `Resource ${index}`,
		type: categoryToInt(r.category),
	}));
	const unitTypes = (save.unitPrototypes ?? []).map((p, index) => ({
		index,
		name: p.name ?? `Unit ${index}`,
		movement: p.movement ?? 0,
		hpBonus: p.hpBonus ?? 0,
		categories: p.categories ?? [],
	}));
	const buildings = (save.buildings ?? []).map((b, index) => ({ index, name: b.name ?? `Building ${index}` }));
	const civilizations = (save.civilizations ?? []).map((c, index) => ({
		index,
		name: c.name ?? `Civilization ${index}`,
		adjective: c.adjective ?? '',
		leaderName: c.leader ?? '',
		defaultColor: c.primaryColorIndex ?? index,
		barbarian: !!c.isBarbarian,
	}));
	return {
		terrains,
		resources,
		unitTypes,
		buildings,
		civilizations,
		techs: [],
		terrainImprovements: [],
		experienceLevels: (save.experienceLevels ?? []).map((l) => ({
			key: l.key,
			baseHitPoints: l.baseHitPoints,
		})),
		title: '',
		description: '',
	};
}

function categoryToInt(category) {
	switch ((category || '').toLowerCase()) {
		case 'strategic': return 1;
		case 'luxury': return 2;
		default: return 0;
	}
}

/** Best-effort land/sea/air classification for a unit prototype. */
function unitTypeKind(name, unitTypes) {
	const proto = unitTypes.find((u) => u.name === name);
	const categories = (proto?.categories ?? []).map((c) => String(c).toLowerCase());
	if (categories.some((c) => c.includes('air') || c.includes('flight'))) return 2;
	if (categories.some((c) => c.includes('sea') || c.includes('naval') || c.includes('ship'))) return 1;
	return 0;
}

/** OpenCiv3 IDs serialise as strings such as "player-3" or "unit-none". */
function parseId(id) {
	if (typeof id === 'number') return id;
	if (typeof id !== 'string') return -1;
	const last = id.split('-').pop();
	if (last === 'none') return -1;
	const n = parseInt(last, 10);
	return Number.isFinite(n) ? n : -1;
}
