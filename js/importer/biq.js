/**
 * Civ3 `.biq` / `.bic` (scenario, map or rules-only) importer.
 *
 * Clean-room port of `OpenCiv3/QueryCiv3/Biq.cs` and `BiqSections/*.cs` (MIT).
 * A BIQ is a repeated `[4-char tag][int32 count][payload]` stream starting at
 * byte 736. Some sections are fixed-size, others embed dynamic sub-arrays; both
 * shapes are handled exactly as the reference does.
 */

import { BinReader } from './binreader.js';
import { maybeDecompress } from './blast.js';
import { Civ3File } from './civ3file.js';
import {
	createWorld, createTileGrid, createPlayer, addWarning,
	DEFAULT_TERRAIN_KEYS, getMapCoordinates, tileIndex,
} from '../model.js';

const SECTION_HEADERS_START = 736;

// Fixed struct sizes (bytes).
const FIXED_SIZES = {
	BLDG: 272, CLNY: 24, CONT: 12, CTZN: 128, CULT: 92, DIFF: 124, ERAS: 268,
	ESPN: 236, EXPR: 44, TECH: 116, TFRM: 116, WSIZ: 84, WCHR: 56,
	TILE: 49, UNIT: 125, SLOC: 20,
};

// Dynamic section chunk lengths (from Biq.cs).
const GOVT_LEN_1 = 400, GOVT_LEN_2 = 76;
const TERR_LEN_1 = 8, TERR_LEN_2 = 225;
const RACE_LEN_1 = 8, RACE_LEN_2 = 4, RACE_LEN_3 = 208, RACE_LEN_4 = 92;
const CITY_LEN_1 = 38, CITY_LEN_2 = 32;
const WMAP_LEN_1 = 8, WMAP_LEN_2 = 164;
const PRTO_LEN_1 = 238, PRTO_LEN_2 = 21;
const LEAD_LEN_1 = 56, LEAD_LEN_2 = 8, LEAD_LEN_3 = 33;
const RULE_LEN_1 = 104, RULE_LEN_2 = 164, RULE_LEN_3 = 32;
const GAME_LEN_1 = 16, GAME_LEN_2 = 5304, GAME_LEN_3 = 2017;
const FLAV_SIZE = 292;
const RACE_CITY_SIZE = 24;
const RACE_LEADER_NAME_SIZE = 32;
const RACE_ERAS_SIZE = 520;
const LEAD_UNIT_SIZE = 8;
const RULE_CULT_SIZE = 64;
const CITY_BUILDING_SIZE = 4;

const EXPERIENCE_KEYS = ['conscript', 'regular', 'veteran', 'elite'];

/**
 * Parse a decompressed-or-raw BIQ/BIC byte array.
 * @param {Uint8Array} input
 * @returns {BiqResult}
 */
export function parseBiqBytes(input) {
	const empty = emptyResult();
	if (!input || input.length < SECTION_HEADERS_START) return empty;
	const bytes = maybeDecompress(input);
	const civ3 = new Civ3File(bytes);
	const r = new BinReader(bytes);

	const rules = empty.rules;
	rules.title = civ3.getString(672, 64);
	rules.description = civ3.getString(32, 640);

	/** @type {number[]} */
	const spaceshipPartsByRule = [];
	let spaceshipPartCount = 0;

	const out = {
		...empty,
		rules,
		title: rules.title,
		description: rules.description,
		version: civ3.version,
	};

	let offset = SECTION_HEADERS_START;
	if (civ3.version.game !== 'conquests') {
		out.warnings.push(
			`This is a ${civ3.version.game}-format file; only Conquests (v1.22) is fully supported and the map may not render.`
		);
	}
	while (offset + 8 <= bytes.length) {
		const tag = r.str(offset, 4);
		const count = r.i32(offset + 4);
		offset += 8;

		// Guard against reading a format we do not understand: if a fixed-size
		// section cannot fit in the remaining bytes, stop rather than reading garbage.
		const fixed = FIXED_SIZES[tag];
		if (fixed !== undefined && count * fixed > bytes.length - offset) {
			out.warnings.push(
				`Section "${tag}" declares more bytes than the file contains (offset ${offset - 8}); stopping before it.`
			);
			break;
		}

		let dataLength;
		try {
			dataLength = readSection(tag, count, offset, r, out, rules, spaceshipPartsByRule);
		} catch (err) {
			out.warnings.push(`Stopped parsing at section "${tag}" (offset ${offset - 8}): ${err.message}`);
			break;
		}
		if (globalThis.__BIQ_DEBUG) console.log(`  [biq] ${tag} count=${count} at=${offset} len=${dataLength}`);
		if (dataLength === null) {
			out.warnings.push(`Unexpected BIQ section "${tag}" at offset ${offset - 8}; stopping.`);
			break;
		}
		offset += dataLength;
	}

	spaceshipPartCount = spaceshipPartsByRule[0] ?? 0;
	if (spaceshipPartsByRule.length > 0) out.spaceshipPartCount = spaceshipPartCount;

	// Fill in terrain water flags by name when the TERR rules didn't say.
	for (let i = 0; i < rules.terrains.length; i++) {
		const t = rules.terrains[i];
		if (t.isWater === undefined) {
			const k = (t.key || '').toLowerCase();
			t.isWater = k.includes('coast') || k.includes('sea') || k.includes('ocean');
		}
	}

	return out;
}

/**
 * Parse a whole BIQ file into a unified WorldModel.
 * @param {Uint8Array} fileBytes
 * @param {string} sourceName
 * @returns {import('../model.js').WorldModel}
 */
export function parseBiq(fileBytes, sourceName) {
	const result = parseBiqBytes(fileBytes);
	const world = createWorld('civ3-biq', sourceName);
	world.version = result.version;
	world.rules = result.rules;
	world.title = result.title;
	world.description = result.description;
	for (const w of result.warnings ?? []) addWarning(world, w);

	if (!result.map) {
		addWarning(world, 'This file contains rules but no map (it is a rules-only BIQ/BIC).');
		world.players = buildBiqPlayers(result);
		return world;
	}

	const { width, height, wrapX, wrapY, seed } = result.map;
	world.width = width;
	world.height = height;
	world.wrapX = wrapX;
	world.wrapY = wrapY;
	world.seed = seed >>> 0;
	world.turn = 0;
	world.year = 0;
	world.players = buildBiqPlayers(result);
	world.tiles = createTileGrid(width, height);

	const expectedSparse = (width * height) / 2;
	const tileData = result.rawTiles;
	if (!tileData || tileData.length === 0) {
		addWarning(world, 'The file has a map but no TILE section.');
		return world;
	}

	if (tileData.length === expectedSparse) {
		for (let i = 0; i < tileData.length; i++) {
			const { x, y } = getMapCoordinates(i, width);
			const tile = world.tiles[tileIndex(x, y, width)];
			if (tile) readBiqTile(tileData[i], tile, result);
		}
	} else if (tileData.length === width * height) {
		// Some files store a dense grid; index directly.
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const tile = world.tiles[tileIndex(x, y, width)];
				if (tile) readBiqTile(tileData[y * width + x], tile, result);
			}
		}
	} else {
		addWarning(
			world,
			`TILE count ${tileData.length} matches neither ${expectedSparse} (sparse) nor ${width * height} (dense); reading as sparse.`
		);
		for (let i = 0; i < Math.min(tileData.length, expectedSparse); i++) {
			const { x, y } = getMapCoordinates(i, width);
			const tile = world.tiles[tileIndex(x, y, width)];
			if (tile) readBiqTile(tileData[i], tile, result);
		}
	}

	world.cities = result.cities.map((c) => ({
		id: c.id,
		owner: c.owner,
		name: c.name || `City ${c.id}`,
		x: c.x,
		y: c.y,
		size: c.size,
		capital: c.capital,
		civilDisorder: false,
		weLoveTheKingDay: false,
		freshWater: false,
		producing: '',
		buildings: c.buildings.map((b) => ({ name: rulesName(world.rules.buildings, b), year: 0, culture: 0 })),
	}));
	for (const city of world.cities) {
		const t = world.tiles[tileIndex(city.x, city.y, world.width)];
		if (t) t.cityId = city.id;
	}

	world.startingLocations = result.startingLocations
		.map(({ x, y }) => world.tiles[tileIndex(x, y, world.width)])
		.filter(Boolean);

	// Mark starting-location tiles for the renderer.
	for (const t of world.startingLocations) t.features.playerStart = true;

	return world;
}

// ---- Section dispatch ---------------------------------------------------

function readSection(tag, count, offset, r, out, rules, spaceshipPartsByRule) {
	const fixed = FIXED_SIZES[tag];
	if (fixed !== undefined) {
		readFixedSection(tag, count, offset, r, out, rules);
		return count * fixed;
	}

	switch (tag) {
		case 'CITY': return readCitySection(count, offset, r, out);
		case 'FLAV': return readFlavSection(count, offset, r, out);
		case 'GAME': return readGameSection(count, offset, r, out);
		case 'GOOD': return readGoodSection(count, offset, r, out, rules);
		case 'GOVT': return readGovtSection(count, offset, r);
		case 'LEAD': return readLeadSection(count, offset, r, out);
		case 'PRTO': return readPrtoSection(count, offset, r, out, rules);
		case 'RACE': return readRaceSection(count, offset, r, out, rules);
		case 'RULE': return readRuleSection(count, offset, r, out, rules, spaceshipPartsByRule);
		case 'TERR': return readTerrSection(count, offset, r, out, rules);
		case 'WMAP': return readWmapSection(count, offset, r, out);
		default: return null;
	}
}

function readFixedSection(tag, count, offset, r, out, rules) {
	switch (tag) {
		case 'BLDG': {
			out.bldgCount = count;
			for (let i = 0; i < count; i++) {
				const o = offset + i * 272;
				rules.buildings.push({
					name: r.str(o + 68, 32),
					description: r.str(o + 4, 64),
					wonder: ((r.u8(o + 240) >> 2) & 1) === 1, // Flags[4] bit2
				});
			}
			break;
		}
		case 'EXPR': {
			for (let i = 0; i < count; i++) {
				const o = offset + i * 48;
				rules.experienceLevels.push({
					key: EXPERIENCE_KEYS[i] ?? `level${i}`,
					name: r.str(o + 4, 32),
					baseHitPoints: r.i32(o + 36),
				});
			}
			break;
		}
		case 'TECH': {
			out.techCount = count;
			for (let i = 0; i < count; i++) {
				rules.techs.push({ name: r.str(offset + i * 116 + 4, 32) });
			}
			break;
		}
		case 'TFRM': {
			for (let i = 0; i < count; i++) {
				const o = offset + i * 116;
				rules.terrainImprovements.push({ name: r.str(o + 4, 32), order: r.str(o + 84, 32) });
			}
			break;
		}
		case 'ERAS': {
			out.erasCount = count;
			break;
		}
		case 'WSIZ': {
			out.worldSizes = out.worldSizes || [];
			for (let i = 0; i < count; i++) {
				const o = offset + i * 84;
				out.worldSizes.push({
					name: r.str(o + 36, 32),
					optimalNumberOfCities: r.i32(o + 4),
					techRate: r.i32(o + 8),
					height: r.i32(o + 68),
					width: r.i32(o + 80),
				});
			}
			break;
		}
		case 'WCHR': {
			out.worldCharacteristics = out.worldCharacteristics || [];
			for (let i = 0; i < count; i++) {
				out.worldCharacteristics.push({ worldSize: r.i32(offset + i * 56 + 52) });
			}
			break;
		}
		case 'SLOC': {
			for (let i = 0; i < count; i++) {
				const o = offset + i * 20;
				out.startingLocations.push({
					ownerType: r.i32(o + 4),
					owner: r.i32(o + 8),
					x: r.i32(o + 12),
					y: r.i32(o + 16),
				});
			}
			break;
		}
		case 'CONT': {
			out.continents = out.continents || [];
			for (let i = 0; i < count; i++) {
				out.continents.push({ type: r.i32(offset + i * 12 + 4) });
			}
			break;
		}
		case 'TILE': {
			out.rawTiles = out.rawTiles || [];
			for (let i = 0; i < count; i++) {
				out.rawTiles.push(readBiqTileRecord(r, offset + i * 49));
			}
			break;
		}
		default:
			break;
	}
}

function readBiqTileRecord(r, o) {
	const riverConnections = r.u8(o + 4);
	const c3cTerrain = r.u8(o + 38);
	const bonuses = o + 43;
	return {
		riverEdges: riverEdgeMask(riverConnections, r.u8(bonuses + 1)),
		resource: r.i32(o + 6),
		textureLocation: r.u8(o + 10),
		textureFile: r.u8(o + 11),
		baseTerrain: c3cTerrain & 0x0f,
		overlayTerrain: (c3cTerrain & 0xf0) >> 4,
		barbarianTribe: r.i16(o + 18),
		colony: r.i16(o + 20),
		city: r.i16(o + 22),
		continent: r.i16(o + 24),
		ruin: r.i32(o + 29),
		road: r.bit(o + 33, 0),
		railroad: r.bit(o + 33, 1),
		mine: r.bit(o + 33, 2),
		irrigation: r.bit(o + 33, 3),
		fortress: r.bit(o + 33, 4),
		goodyHut: r.bit(o + 33, 5),
		pollution: r.bit(o + 33, 6),
		barbarianCamp: r.bit(o + 33, 7),
		craters: r.bit(o + 34, 0),
		barricade: r.bit(o + 36, 4),
		airfield: r.bit(o + 36, 5),
		radarTower: r.bit(o + 36, 6),
		outpost: r.bit(o + 36, 7),
		bonusShield: r.bit(bonuses, 0),
		playerStart: r.bit(bonuses, 3),
		snowCapped: r.bit(bonuses, 4),
		pineForest: r.bit(bonuses, 5),
		fogOfWar: r.i16(o + 41),
	};
}

/** Combine BIQ river bits: cardinals from C3CBonuses[1], diagonals from RiverConnections. */
function riverEdgeMask(riverConnections, bonusByte) {
	let mask = riverConnections & 0xaa; // NE, SE, SW, NW keep their bit positions
	if (bonusByte & 0x01) mask |= 1 << 0; // N
	if (bonusByte & 0x08) mask |= 1 << 4; // S
	if (bonusByte & 0x02) mask |= 1 << 6; // W
	if (bonusByte & 0x04) mask |= 1 << 2; // E
	return mask;
}

function readBiqTile(record, tile, result) {
	tile.baseTerrain = result.rules.terrains[record.baseTerrain]?.key ?? DEFAULT_TERRAIN_KEYS[record.baseTerrain] ?? 'grassland';
	tile.overlayTerrain = result.rules.terrains[record.overlayTerrain]?.key ?? DEFAULT_TERRAIN_KEYS[record.overlayTerrain] ?? tile.baseTerrain;
	tile.continent = record.continent;
	tile.riverEdges = record.riverEdges;
	tile.textureFile = record.textureFile;
	tile.textureLocation = record.textureLocation;
	tile.resource = record.resource >= 0 ? result.rules.resources[record.resource]?.key ?? null : null;
	tile.cityId = record.city;
	tile.colonyId = record.colony;
	tile.barbTribe = record.barbarianTribe;

	tile.improvements.road = record.road;
	tile.improvements.railroad = record.railroad;
	tile.improvements.mine = record.mine;
	tile.improvements.irrigation = record.irrigation;
	tile.improvements.fortress = record.fortress;
	tile.improvements.barricade = record.barricade;
	tile.improvements.airfield = record.airfield;
	tile.improvements.radarTower = record.radarTower;
	tile.improvements.outpost = record.outpost;

	tile.features.goodyHut = record.goodyHut;
	tile.features.pollution = record.pollution;
	tile.features.craters = record.craters;
	tile.features.ruins = record.ruin > 0;
	tile.features.bonusShield = record.bonusShield;
	tile.features.snowCapped = record.snowCapped;
	tile.features.pineForest = record.pineForest;
	tile.features.barbarianCamp = record.barbarianCamp;
}

// ---- Dynamic sections ---------------------------------------------------

function readTerrSection(count, offset, r, out, rules) {
	out.terrainCount = count;
	const goodCount = r.i32(offset + 4);
	const bitmaskLen = Math.ceil(goodCount / 8);
	const terrLen = r.i32(offset) + 4;

	for (let i = 0; i < count; i++) {
		const o = offset + i * terrLen;
		const nameOffset = o + TERR_LEN_1 + bitmaskLen;
		const name = r.str(nameOffset, 32);
		const key = (name || DEFAULT_TERRAIN_KEYS[i] || `terrain ${i}`).toLowerCase();
		const lower = key.toLowerCase();
		rules.terrains.push({
			index: i,
			key,
			name: name || DEFAULT_TERRAIN_KEYS[i] || `Terrain ${i}`,
			isWater: lower.includes('coast') || lower.includes('sea') || lower.includes('ocean'),
		});
	}
	out.goodCountInTerr = goodCount;
	return count * terrLen;
}

function readGoodSection(count, offset, r, out, rules) {
	out.goodCount = count;
	for (let i = 0; i < count; i++) {
		const o = offset + i * 92;
		const name = r.str(o + 4, 24);
		rules.resources.push({
			index: i,
			key: name,
			name,
			type: r.i32(o + 60),
			foodBonus: r.i32(o + 80),
			shieldsBonus: r.i32(o + 84),
			commerceBonus: r.i32(o + 88),
		});
	}
	return count * 92;
}

function readPrtoSection(count, offset, r, out, rules) {
	out.prtoCount = count;
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const name = r.str(cursor + 8, 32);
		rules.unitTypes.push({
			index: i,
			name,
			type: r.i32(cursor + 156), // 0 land, 1 sea, 2 air
			movement: r.i32(cursor + 112),
			hpBonus: r.i32(cursor + 164),
		});
		cursor += length + 4;
		dataLength += length + 4;
	}
	out.prtoCount = count;
	return dataLength;
}

function readRaceSection(count, offset, r, out, rules) {
	let dataLength = 0;
	let cursor = offset;
	// The RACE section's era sub-records depend on the ERAS count.
	const eras = out.erasCount ?? 4;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const numberOfCities = r.i32(cursor + 4);
		const cityNamesEnd = cursor + 8 + numberOfCities * RACE_CITY_SIZE;
		const numberOfGreatLeaders = r.i32(cityNamesEnd);
		const len3Start = cityNamesEnd + 4 + numberOfGreatLeaders * RACE_LEADER_NAME_SIZE;
		const len4Start = len3Start + RACE_LEN_3 + eras * RACE_ERAS_SIZE;

		const leaderName = r.str(len3Start + 0, 32) || r.str(len3Start + 0, 32);
		const adjective = r.str(len3Start + 88, 40);
		const civName = r.str(len3Start + 128, 40);
		const noun = r.str(len3Start + 168, 40);
		const defaultColor = r.i32(len4Start + 28);

		rules.civilizations.push({
			index: i,
			name: civName || `Civilization ${i}`,
			adjective,
			noun,
			leaderName,
			defaultColor,
			barbarian: i === 0,
		});

		cursor += length + 4;
		dataLength += length + 4;
	}
	out.raceCount = count;
	return dataLength;
}

function readLeadSection(count, offset, r, out) {
	out.leads = out.leads || [];
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const humanPlayer = r.i32(cursor + 8);
		const leaderName = r.str(cursor + 12, 32);
		const numberOfStartUnitTypes = r.i32(cursor + 52);
		const len2Start = cursor + LEAD_LEN_1 + numberOfStartUnitTypes * LEAD_UNIT_SIZE;
		const numberOfStartingTechs = r.i32(len2Start + 4);
		const len3Start = len2Start + LEAD_LEN_2 + numberOfStartingTechs * 4;
		const civ = r.i32(len3Start + 16); // struct offset 80
		const color = r.i32(len3Start + 20); // struct offset 84
		out.leads.push({ index: i, humanPlayer, leaderName, civ, color });
		cursor += length + 4;
		dataLength += length + 4;
	}
	return dataLength;
}

function readRuleSection(count, offset, r, out, rules, spaceshipPartsByRule) {
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const numberOfSpaceshipParts = r.i32(cursor + 100);
		spaceshipPartsByRule.push(numberOfSpaceshipParts);
		if (i === 0) out.spaceshipPartCount = numberOfSpaceshipParts;
		const len2Start = cursor + RULE_LEN_1 + numberOfSpaceshipParts * 4;
		out.startUnitTypes = {
			startUnitType1: r.i32(len2Start + 120), // struct offset 224
			startUnitType2: r.i32(len2Start + 124),
		};
		// Culture-level names are not needed; the count is used to advance correctly.
		const numberOfCultureLevels = r.i32(len2Start + 160); // struct offset 264
		void numberOfCultureLevels;
		cursor += length + 4;
		dataLength += length + 4;
	}
	return dataLength;
}

function readWmapSection(count, offset, r, out) {
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const numberOfResources = r.i32(cursor + 4);
		const fixed = cursor + WMAP_LEN_1 + numberOfResources * 4;
		if (i === 0) {
			out.map = {
				width: r.i32(fixed + 24),
				height: r.i32(fixed + 4),
				seed: r.i32(fixed + 156),
				wrapX: r.bit(fixed + 160, 0),
				wrapY: r.bit(fixed + 160, 1),
			};
		}
		cursor += length + 4;
		dataLength += length + 4;
	}
	return dataLength;
}

function readCitySection(count, offset, r, out) {
	out.cities = out.cities || [];
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const name = r.str(cursor + 6, 30);
		const ownerType = r.i32(cursor + 30);
		const numberOfBuildings = r.i32(cursor + 34);
		const buildingsOff = cursor + CITY_LEN_1;
		const buildings = [];
		for (let b = 0; b < numberOfBuildings; b++) buildings.push(r.i32(buildingsOff + b * CITY_BUILDING_SIZE));
		const tail = buildingsOff + numberOfBuildings * CITY_BUILDING_SIZE;
		out.cities.push({
			id: i,
			name,
			ownerType,
			owner: ownerType >= 2 ? r.i32(tail + 4) : -1,
			size: r.i32(tail + 8),
			x: r.i32(tail + 12),
			y: r.i32(tail + 16),
			capital: r.u8(cursor + 5) !== 0,
			buildings,
		});
		cursor += length + 4;
		dataLength += length + 4;
	}
	return dataLength;
}

function readGameSection(count, offset, r, out) {
	let dataLength = 0;
	let cursor = offset;
	for (let i = 0; i < count; i++) {
		const length = r.i32(cursor);
		const playableCivs = r.i32(cursor + 12);
		if (i === 0) out.playableCivs = playableCivs;
		cursor += length + 4;
		dataLength += length + 4;
	}
	return dataLength;
}

function readGovtSection(count, offset, r) {
	const govtLen = r.i32(offset) + 4;
	return count * govtLen;
}

function readFlavSection(count, offset, r) {
	// FLAV always has 7 entries plus a leading section-group int.
	void count;
	void r;
	return 4 + 7 * FLAV_SIZE;
}

function buildBiqPlayers(result) {
	const rules = result.rules;
	const leads = result.leads ?? [];
	const players = [];
	for (let i = 0; i < rules.civilizations.length; i++) {
		const civ = rules.civilizations[i];
		const lead = leads[i];
		const player = createPlayer(i);
		player.civName = civ.name;
		player.adjective = civ.adjective;
		player.leaderName = lead?.leaderName || civ.leaderName || '';
		player.primaryColor = lead && lead.color >= 0 ? lead.color : civ.defaultColor;
		player.human = lead ? lead.humanPlayer === 1 : false;
		player.barbarian = civ.barbarian;
		player.alive = !civ.barbarian;
		players.push(player);
	}
	return players;
}

function rulesName(list, index) {
	return list[index]?.name ?? `#${index}`;
}

function emptyResult() {
	return {
		rules: {
			terrains: [],
			resources: [],
			unitTypes: [],
			buildings: [],
			techs: [],
			terrainImprovements: [],
			civilizations: [],
			experienceLevels: [],
			title: '',
			description: '',
		},
		title: '',
		description: '',
		goodCount: null,
		bldgCount: null,
		prtoCount: null,
		techCount: null,
		raceCount: null,
		terrainCount: null,
		spaceshipPartCount: null,
		map: null,
		rawTiles: null,
		startingLocations: [],
		cities: [],
		leads: [],
		continents: [],
		worldSizes: [],
		worldCharacteristics: [],
		warnings: [],
	};
}

/**
 * @typedef {Object} BiqResult
 * @property {Object} rules
 * @property {string} title
 * @property {string} description
 * @property {number} goodCount
 * @property {number} bldgCount
 * @property {number} prtoCount
 * @property {number} techCount
 * @property {number} raceCount
 * @property {number} spaceshipPartCount
 * @property {{width:number,height:number,wrapX:boolean,wrapY:boolean,seed:number}|null} map
 * @property {any[]|null} rawTiles
 * @property {Array<{x:number,y:number}>} startingLocations
 */
