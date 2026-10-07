/**
 * Fallback rules used when a save's embedded BIQ is incomplete.
 *
 * Civ3 saves embed only the sections that differ from the base game, so a
 * base-game save often carries no TERR/GOOD/PRTO/BLDG/TECH sections at all.
 * The reference implementation (OpenCiv3's `ImportCiv3`) fills the gaps from a
 * separately supplied base `conquests.biq`. We cannot ship that file, so we use
 * these counts (needed to walk the save's dynamic sections correctly) and the
 * base terrain/resource key lists (also documented in MAP_VIEWER_SPEC.md and
 * TOOLCHAIN.md). Unit and building names are left generic unless the user
 * supplies the base BIQ.
 */

/** Base-game section counts, needed to advance through LEAD/GAME arrays. */
export const DEFAULT_COUNTS = {
	terrain: 14,
	good: 26,
	bldg: 83,
	prto: 141,
	tech: 83,
	race: 32,
	spaceshipParts: 10,
};

/** Base terrain order (index = TERR index). */
export const DEFAULT_TERRAIN_KEYS = [
	'desert', 'plains', 'grassland', 'tundra', 'flood plain', 'hills', 'mountains',
	'forest', 'jungle', 'marsh', 'volcano', 'coast', 'sea', 'ocean',
];

const WATER_TERRAINS = new Set(['coast', 'sea', 'ocean']);

/** Base resource order (index = GOOD index). */
export const DEFAULT_RESOURCE_KEYS = [
	'Horses', 'Iron', 'Saltpeter', 'Coal', 'Oil', 'Rubber', 'Aluminum', 'Uranium',
	'Wines', 'Furs', 'Dyes', 'Incense', 'Spices', 'Ivory', 'Silks', 'Gems',
	'Whales', 'Game', 'Fish', 'Cattle', 'Wheat', 'Gold', 'Sugar', 'Tropical Fruit',
	'Oasis', 'Tobacco',
];

export const DEFAULT_EXPERIENCE_LEVELS = [
	{ key: 'conscript', baseHitPoints: 2 },
	{ key: 'regular', baseHitPoints: 3 },
	{ key: 'veteran', baseHitPoints: 4 },
	{ key: 'elite', baseHitPoints: 5 },
];

/**
 * Fill an empty or partial ruleset with documented defaults.
 * Mutates and returns `rules`.
 * @param {object} rules
 */
export function applyRulesDefaults(rules) {
	if (!rules.terrains || rules.terrains.length === 0) {
		rules.terrains = DEFAULT_TERRAIN_KEYS.map((key, index) => ({
			index,
			key,
			name: key,
			isWater: WATER_TERRAINS.has(key),
		}));
	}
	if (!rules.resources || rules.resources.length === 0) {
		rules.resources = DEFAULT_RESOURCE_KEYS.map((key, index) => ({ index, key, name: key, type: 0 }));
	}
	if (!rules.experienceLevels || rules.experienceLevels.length === 0) {
		rules.experienceLevels = DEFAULT_EXPERIENCE_LEVELS.map((l) => ({ ...l }));
	}
	if (!rules.civilizations) rules.civilizations = [];
	if (!rules.unitTypes) rules.unitTypes = [];
	if (!rules.buildings) rules.buildings = [];
	if (!rules.techs) rules.techs = [];
	if (!rules.terrainImprovements) rules.terrainImprovements = [];
	return rules;
}

/**
 * Build the counts a save needs, preferring embedded-BIQ values and falling
 * back to the base-game defaults.
 * @param {{goodCount:number|null,bldgCount:number|null,prtoCount:number|null,techCount:number|null,spaceshipPartCount:number|null}} biq
 */
export function resolveCounts(biq) {
	return {
		terrain: biq.terrainCount ?? DEFAULT_COUNTS.terrain,
		good: biq.goodCount ?? DEFAULT_COUNTS.good,
		bldg: biq.bldgCount ?? DEFAULT_COUNTS.bldg,
		prto: biq.prtoCount ?? DEFAULT_COUNTS.prto,
		tech: biq.techCount ?? DEFAULT_COUNTS.tech,
		race: biq.raceCount ?? DEFAULT_COUNTS.race,
		spaceshipParts: biq.spaceshipPartCount ?? DEFAULT_COUNTS.spaceshipParts,
	};
}
