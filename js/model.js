/**
 * The unified model every importer produces and the renderer consumes.
 * See MAP_VIEWER_SPEC.md §5.
 */

/** Default Civ3 terrain order (index = terrain id in a BIQ TERR list). */
export const DEFAULT_TERRAIN_KEYS = [
	'desert', 'plains', 'grassland', 'tundra', 'flood plain', 'hills', 'mountains',
	'forest', 'jungle', 'marsh', 'volcano', 'coast', 'sea', 'ocean',
];

/** Improvement keys carried on every tile. */
export const IMPROVEMENT_KEYS = [
	'road', 'railroad', 'mine', 'irrigation', 'fortress', 'barricade',
	'airfield', 'radarTower', 'outpost',
];

/** Feature keys carried on every tile. */
export const FEATURE_KEYS = [
	'goodyHut', 'barbarianCamp', 'pollution', 'craters', 'ruins',
	'bonusShield', 'snowCapped', 'pineForest',
];

/** River edge bit order (bit 0 = N, then clockwise). */
export const RIVER_EDGES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** @returns {number} dense row-major index for tile (x, y). */
export function tileIndex(x, y, width) {
	return y * width + x;
}

/** A real Civ3 tile exists where x and y share parity (half the grid is used). */
export function isRealTile(x, y) {
	return ((x + y) & 1) === 0;
}

/**
 * Sparse SAV tile index -> (x, y), exactly as ImportCiv3.GetMapCoordinates.
 * @param {number} index
 * @param {number} mapWidth
 */
export function getMapCoordinates(index, mapWidth) {
	const half = mapWidth / 2;
	const y = Math.floor(index / half);
	const x = (index % half) * 2 + (y % 2);
	return { x, y };
}

/** @returns {number} sparse index for real tile (x, y). */
export function sparseIndex(x, y, width) {
	const half = width / 2;
	return y * half + ((x - (y % 2)) >> 1);
}

export function createImprovements() {
	const o = {};
	for (const k of IMPROVEMENT_KEYS) o[k] = false;
	return o;
}

export function createFeatures() {
	const o = {};
	for (const k of FEATURE_KEYS) o[k] = false;
	return o;
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {import('./model.js').Tile}
 */
export function createTile(x, y) {
	return {
		x, y,
		baseTerrain: 'ocean',
		overlayTerrain: 'ocean',
		resource: null,
		continent: -1,
		owner: -1,
		freshWater: false,
		riverEdges: 0,
		improvements: createImprovements(),
		features: createFeatures(),
		cityId: -1,
		colonyId: -1,
		barbTribe: -1,
		textureFile: 0,
		textureLocation: 0,
		exploredBy: [],
		visibleTo: [],
	};
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {Array<import('./model.js').Tile|null>}
 */
export function createTileGrid(width, height) {
	const tiles = new Array(width * height).fill(null);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (isRealTile(x, y)) tiles[tileIndex(x, y, width)] = createTile(x, y);
		}
	}
	return tiles;
}

export function createPlayer(id) {
	return {
		id,
		civName: `Player ${id + 1}`,
		leaderName: '',
		adjective: '',
		primaryColor: id % 32,
		human: false,
		alive: true,
		barbarian: false,
		gold: 0,
		culture: 0,
		score: 0,
	};
}

/**
 * @returns {import('./model.js').WorldModel}
 */
export function createWorld(source, sourceName) {
	return {
		source,
		sourceName,
		width: 0,
		height: 0,
		wrapX: false,
		wrapY: false,
		turn: 0,
		year: 0,
		seed: 0,
		players: [],
		tiles: [],
		cities: [],
		units: [],
		startingLocations: [],
		rules: createRules(),
		warnings: [],
	};
}

export function createRules() {
	return {
		terrains: [],
		resources: [],
		unitTypes: [],
		buildings: [],
		techs: [],
		terrainImprovements: [],
		title: '',
		description: '',
	};
}

/**
 * Warnings are surfaced in the load report.
 * @param {import('./model.js').WorldModel} world
 * @param {string} message
 */
export function addWarning(world, message) {
	world.warnings.push({ message });
}

// ---- JSDoc typedefs (documentation; no runtime effect) -------------------

/**
 * @typedef {Object} WorldModel
 * @property {'civ3-sav'|'civ3-biq'|'openciv3-json'} source
 * @property {string} sourceName
 * @property {number} width
 * @property {number} height
 * @property {boolean} wrapX
 * @property {boolean} wrapY
 * @property {number} turn
 * @property {number} year
 * @property {number} seed
 * @property {Player[]} players
 * @property {Array<Tile|null>} tiles
 * @property {City[]} cities
 * @property {Unit[]} units
 * @property {Tile[]} startingLocations
 * @property {Rules} rules
 * @property {Warning[]} warnings
 */

/**
 * @typedef {Object} Player
 * @property {number} id
 * @property {string} civName
 * @property {string} leaderName
 * @property {string} adjective
 * @property {number} primaryColor
 * @property {boolean} human
 * @property {boolean} alive
 * @property {boolean} barbarian
 * @property {number} gold
 * @property {number} culture
 * @property {number} score
 */

/**
 * @typedef {Object} Tile
 * @property {number} x
 * @property {number} y
 * @property {string} baseTerrain
 * @property {string} overlayTerrain
 * @property {string|null} resource
 * @property {number} continent
 * @property {number} owner
 * @property {boolean} freshWater
 * @property {number} riverEdges
 * @property {Object<string,boolean>} improvements
 * @property {Object<string,boolean>} features
 * @property {number} cityId
 * @property {number} colonyId
 * @property {number} barbTribe
 * @property {number} textureFile
 * @property {number} textureLocation
 * @property {number[]} exploredBy
 * @property {number[]} visibleTo
 */

/**
 * @typedef {Object} City
 * @property {number} id
 * @property {number} owner
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} size
 * @property {boolean} capital
 * @property {boolean} civilDisorder
 * @property {boolean} weLoveTheKingDay
 * @property {boolean} freshWater
 * @property {string} producing
 * @property {Building[]} buildings
 */

/**
 * @typedef {Object} Building
 * @property {string} name
 * @property {number} year
 * @property {number} culture
 */

/**
 * @typedef {Object} Unit
 * @property {number} id
 * @property {number} owner
 * @property {string} prototype
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {string} experience
 * @property {number} hp
 * @property {number} movementRemaining
 * @property {boolean} fortified
 * @property {boolean} automated
 * @property {string} nationality
 */

/**
 * @typedef {Object} Warning
 * @property {string} message
 */
