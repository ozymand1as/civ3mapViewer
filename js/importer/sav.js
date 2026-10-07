/**
 * Civ3 `.sav` (Conquests / Complete v1.22) importer.
 *
 * Clean-room port of `OpenCiv3/QueryCiv3/Sav.cs` and `SavSections/*.cs` (MIT).
 * The section walk is replicated exactly, including the three "magic gap"
 * resync rules and the dirty CITY header heuristic.
 */

import { BinReader } from './binreader.js';
import { maybeDecompress } from './blast.js';
import { Civ3File } from './civ3file.js';
import { parseBiqBytes } from './biq.js';
import { applyRulesDefaults, resolveCounts } from './defaults.js';
import {
	createWorld, createTileGrid, createPlayer, addWarning,
	DEFAULT_TERRAIN_KEYS, getMapCoordinates, tileIndex,
} from '../model.js';

const BIQ_SECTION_START = 562;

// Struct sizes needed to walk the section stream (from the C# struct layouts).
const SAV_GAME_SIZE = 856;
const SAV_WRLD_SIZE = 242;
const SAV_TILE_SIZE = 212;
const SAV_CONT_SIZE = 16;
const SAV_UNIT_SIZE = 480;
const SAV_IDLS_SIZE = 56;
const SAV_DATE_SIZE = 92;
const SAV_CLNY_SIZE = 24;
const SAV_CITY_LEN_1 = 556;
const SAV_CITY_LEN_2 = 12;
const SAV_CITY_LEN_3 = 140;
const SAV_CTZN_SIZE = 308;
const SAV_CITY_BUILDING_SIZE = 12;
const SAV_RPLT_SIZE = 17;
const SAV_RPLE_SIZE = 18;
const SAV_AIBS_SIZE = 24;
const SAV_LOC_SIZE = 20;
const SAV_PEER_SIZE = 32;
const SAV_PALV_SIZE = 156;
const SAV_PLGI_SIZE = 28;
const SAV_CNSL_SIZE = 236;
const SAV_TUTR_SIZE = 100;
const SAV_FAXX_SIZE = 96;
const SAV_HIST_SIZE = 12;
const SAV_TURN_SIZE = 12;
const SAV_DATE_YEAR_OFFSET = 84; // DATE: hdr(8) + text(64) + baseUnit(4) + month(4) + week(4)
const VALID_CITY_LENGTH = 136;

const LEAD_COUNT = 32;
const LEAD_LEN_1 = 412;
const LEAD_LEN_2 = 2696;
const LEAD_LEN_3 = 108;
const LEAD_LEN_4 = 292;
const LEAD_LEAD_SIZE = 76;
const LEAD_GOOD_LEAD_SIZE = 3;

/**
 * @param {Uint8Array} fileBytes raw file bytes
 * @param {string} sourceName
 * @returns {import('../model.js').WorldModel}
 */
export function parseSav(fileBytes, sourceName) {
	const bytes = maybeDecompress(fileBytes);
	const civ3 = new Civ3File(bytes);
	const world = createWorld('civ3-sav', sourceName);
	world.version = civ3.version;

	// Parse the embedded BIQ first: it supplies terrain/resource/civ/unit names.
	const biqLength = civ3.length >= 42 ? civ3.readInt32(38) : 0;
	let biqBytes = new Uint8Array(0);
	if (biqLength > 0 && BIQ_SECTION_START + biqLength <= civ3.length) {
		biqBytes = bytes.slice(BIQ_SECTION_START, BIQ_SECTION_START + biqLength);
	} else {
		addWarning(world, `Embedded BIQ length is invalid (${biqLength}); rules lookups will use defaults.`);
	}

	const biq = parseBiqBytes(biqBytes);
	for (const w of biq.warnings ?? []) addWarning(world, `Embedded BIQ: ${w}`);
	world.rules = biq.rules;
	world.title = biq.title;
	world.description = biq.description;
	applyRulesDefaults(world.rules);

	const r = new BinReader(bytes);
	const counts = resolveCounts(biq);

	/** @type {any[]} */
	const leads = new Array(LEAD_COUNT).fill(null);
	/** @type {any[]} */
	const rawCities = [];
	/** @type {any[]} */
	const rawUnits = [];
	let game = null;
	let wrld = null;
	let tileBytes = null;
	let dateYear = null;

	let pos = BIQ_SECTION_START + Math.max(0, biqLength);
	const end = civ3.length;

	try {
		let guard = 0;
		walk: while (pos < end) {
			if (end - pos < 8) break;
			if (++guard > 100000) throw new Error(`Section walk did not terminate near offset ${pos}`);
			const start = pos;
			const tag = r.str(pos, 4);
			if (globalThis.__SAV_DEBUG) console.log(`  [sav] ${JSON.stringify(tag)} at ${pos}`);
			switch (tag) {
				case 'GAME': {
					game = readGame(r, pos, counts);
					pos = game.nextOffset;
					break;
				}
				case 'WRLD': {
					wrld = readWrld(r, pos);
					pos += SAV_WRLD_SIZE;
					break;
				}
				case 'TILE': {
					if (!wrld) throw new Error('TILE section before WRLD');
					tileBytes = pos;
					pos += ((wrld.width * wrld.height) / 2) * SAV_TILE_SIZE;
					break;
				}
				case 'CONT': {
					pos += (game ? game.numberOfContinents : 0) * SAV_CONT_SIZE;
					pos += counts.good * 4; // ResourceCounts
					break;
				}
				case 'LEAD': {
					pos = readLeads(r, pos, counts, leads, wrld ? wrld.continentCount : 0);
					break;
				}
				case 'CITY': {
					const byteCount = cityByteCountOf(r, pos);
					if (byteCount === null) {
						pos += r.u8(pos + 4) + 8; // dirty header
					} else {
						rawCities.push(readCity(r, pos));
						pos += byteCount;
					}
					break;
				}
				case 'UNIT': {
					pos = readUnits(r, pos, game ? game.numberOfUnits : 0, rawUnits);
					break;
				}
				case 'DATE': {
					// Civ3 writes up to three DATE slots; the first is the current date.
					if (dateYear === null) dateYear = r.i32(pos + SAV_DATE_YEAR_OFFSET);
					pos += SAV_DATE_SIZE;
					break;
				}
				case 'RPLS':
					pos = skipRpls(r, pos);
					break;
				case 'AIBS':
					pos += (game ? game.numberOfAirbases : 0) * SAV_AIBS_SIZE;
					break;
				case 'OUTP':
					pos += (game ? game.numberOfOutposts : 0) * SAV_LOC_SIZE;
					break;
				case 'VLOC':
					pos += (game ? game.numberOfVPLocations : 0) * SAV_LOC_SIZE;
					break;
				case 'RADT':
					pos += (game ? game.numberOfRadarTowers : 0) * SAV_LOC_SIZE;
					break;
				case 'PEER':
					pos += SAV_PEER_SIZE;
					break;
				case 'PALV':
					pos += LEAD_COUNT * SAV_PALV_SIZE;
					break;
				case 'PLGI':
					pos += SAV_PLGI_SIZE;
					break;
				case 'CNSL':
					pos += SAV_CNSL_SIZE;
					break;
				case 'TUTR':
					pos += SAV_TUTR_SIZE;
					break;
				case 'FAXX':
					pos += SAV_FAXX_SIZE;
					break;
				case 'HIST':
					pos = skipHist(r, pos, game);
					break;
				case 'CTPG':
					pos += r.u8(pos + 4) + 8;
					break;
				case 'CLNY':
					pos += (game ? game.numberOfColonies : 0) * SAV_CLNY_SIZE;
					break;
				default: {
					// Three inexplicable, consistent gaps in real save files.
					if (r.str(pos + 8, 4) === 'CNSL') pos += 8;
					else if (pos + 260 <= end && r.str(pos + 256, 4) === 'PALV') pos += 256;
					else if (r.str(pos + 4, 4) === 'PEER') pos += 4;
					else if (isPadding(r, pos, end)) break walk; // trailing 0x00/0xFF pad
					else throw new Error(`No section header found at offset ${pos} (found "${tag}")`);
					break;
				}
			}
			if (pos <= start) throw new Error(`Section walk stalled at offset ${start} (tag "${tag}")`);
		}
	} catch (err) {
		addWarning(world, `SAV section walk stopped: ${err.message}`);
	}

	if (!wrld) throw new Error('SAV file contains no WRLD section; cannot determine map size.');

	// ---- Build the unified model -----------------------------------------
	world.width = wrld.width;
	world.height = wrld.height;
	world.wrapX = wrld.wrapX;
	world.wrapY = wrld.wrapY;
	world.seed = wrld.worldSeed >>> 0;
	world.turn = game ? game.turnNumber : 0;
	world.year = dateYear !== null ? dateYear : game ? game.gameYear : 0;

	if (world.width * world.height <= 0 || tileBytes === null) {
		throw new Error('SAV file has no usable TILE data.');
	}

	world.players = buildSavPlayers(leads, biq, game);
	world.tiles = createTileGrid(world.width, world.height);

	const realTileCount = (world.width * world.height) / 2;
	const available = Math.floor((civ3.length - tileBytes) / SAV_TILE_SIZE);
	const tilesToRead = Math.min(realTileCount, available);
	if (tilesToRead < realTileCount) {
		addWarning(world, `TILE section is truncated: ${tilesToRead}/${realTileCount} tiles present.`);
	}

	for (let i = 0; i < tilesToRead; i++) {
		const off = tileBytes + i * SAV_TILE_SIZE;
		const { x, y } = getMapCoordinates(i, world.width);
		const tile = world.tiles[tileIndex(x, y, world.width)];
		if (!tile) continue;
		readSavTile(r, off, tile, biq);
	}

	// ---- Cities -----------------------------------------------------------
	world.cities = rawCities.map((raw, index) => {
		const lead = leads[raw.owner];
		return {
			id: raw.id,
			owner: raw.owner,
			name: raw.name,
			x: raw.x,
			y: raw.y,
			size: raw.size,
			capital: lead ? lead.capitalCity === index : false,
			civilDisorder: raw.civilDisorder,
			weLoveTheKingDay: raw.weLoveTheKingDay,
			freshWater: raw.freshWater,
			producing: resolveProducible(biq.rules, raw.constructing, raw.constructingType),
			buildings: raw.buildings.map((b) => ({
				name: biq.rules.buildings[b.index]?.name ?? `Building ${b.index}`,
				year: b.year,
				culture: b.culture,
			})),
		};
	});
	for (const city of world.cities) {
		const t = world.tiles[tileIndex(city.x, city.y, world.width)];
		if (t) t.cityId = city.id;
	}

	// ---- Units ------------------------------------------------------------
	world.units = rawUnits
		.filter((u) => u.owner >= 0)
		.map((u) => {
			const proto = biq.rules.unitTypes[u.unitType];
			const level = biq.rules.experienceLevels[u.experienceLevel] ?? { key: 'regular', baseHitPoints: 3 };
			return {
				id: u.id,
				owner: u.owner,
				prototype: proto?.name ?? `Unit ${u.unitType}`,
				type: proto?.type ?? 0,
				name: u.name || proto?.name || `Unit ${u.unitType}`,
				x: u.x,
				y: u.y,
				experience: level.key ?? `level ${u.experienceLevel}`,
				hp: Math.max(0, (level.baseHitPoints ?? 3) + (proto?.hpBonus ?? 0) - u.damage),
				movementRemaining: Math.max(0, (proto?.movement ?? 0) - u.movementUsed / 3),
				fortified: u.fortified,
				automated: u.automated,
				nationality: biq.rules.civilizations[u.nationality]?.name ?? '',
				barbTribe: u.barbTribe,
			};
		});

	// ---- Starting locations ----------------------------------------------
	const starts = [];
	if (biq.startingLocations?.length) {
		for (const s of biq.startingLocations) {
			if (s.ownerType >= 2) starts.push({ x: s.x, y: s.y });
		}
	}
	world.startingLocations = starts
		.map(({ x, y }) => world.tiles[tileIndex(x, y, world.width)])
		.filter(Boolean);
	for (const t of world.startingLocations) t.features.playerStart = true;

	return world;
}

// ---- Section readers ----------------------------------------------------

function readGame(r, pos, counts) {
	const numberOfUnits = r.i32(pos + 32);
	const numberOfCities = r.i32(pos + 36);
	const numberOfColonies = r.i32(pos + 40);
	const turnNumber = r.i32(pos + 64);
	const gameYear = r.i32(pos + 68);
	const humanPlayers = r.u32(pos + 80);
	const remainingPlayers = r.u32(pos + 84);
	const numberOfContinents = r.i32(pos + 300);
	const numberOfPlayers = r.i32(pos + 304);
	const numberOfAirbases = r.i32(pos + 308);
	const numberOfVPLocations = r.i32(pos + 312);
	const numberOfRadarTowers = r.i32(pos + 316);
	const numberOfOutposts = r.i32(pos + 320);
	const victoryLocations = r.bit(pos + 12 + 5, 5);

	// Dynamic arrays that follow the fixed GAME struct.
	let next = pos + SAV_GAME_SIZE;
	next += numberOfContinents * 4; // CitiesPerContinent
	next += counts.tech * 4; // KnownTechFlags
	next += counts.bldg * 4; // GreatWonderCityIDs
	next += counts.bldg * 1; // GreatWondersBuilt
	next += counts.bldg * 4; // BuildingData1
	next += counts.bldg * 4; // BuildingData2
	next += counts.prto * 4; // PrototypeStrategy1
	next += counts.prto * 4; // PrototypeStrategy2
	next += counts.tech * 4; // TechData

	return {
		numberOfUnits, numberOfCities, numberOfColonies, turnNumber, gameYear,
		humanPlayers, remainingPlayers, numberOfContinents, numberOfPlayers,
		numberOfAirbases, numberOfVPLocations, numberOfRadarTowers,
		numberOfOutposts, victoryLocations, nextOffset: next,
	};
}

function readWrld(r, pos) {
	return {
		continentCount: r.i16(pos + 8),
		height: r.i32(pos + 22),
		width: r.i32(pos + 42),
		worldSeed: r.i32(pos + 174),
		wrapX: r.bit(pos + 178, 0),
		wrapY: r.bit(pos + 178, 1),
		polarIceCaps: r.bit(pos + 178, 2),
		wsizId: r.i32(pos + 238),
	};
}

/** Total byte length of a CITY record, or null when it is a dirty header. */
function cityByteCountOf(r, pos) {
	if (r.u8(pos + 4) !== VALID_CITY_LENGTH) return null;
	const citizenCount = r.i32(pos + 552); // POPD.CitizenCount
	const buildingCount = r.i32(pos + SAV_CITY_LEN_1 + citizenCount * SAV_CTZN_SIZE + 8); // BINF.BuildingCount
	return (
		SAV_CITY_LEN_1 +
		citizenCount * SAV_CTZN_SIZE +
		SAV_CITY_LEN_2 +
		buildingCount * SAV_CITY_BUILDING_SIZE +
		SAV_CITY_LEN_3
	);
}

function readCity(r, pos) {
	const owner = r.u8(pos + 16);
	const flags = pos + 24;
	const citizenCount = r.i32(pos + 552); // POPD.CitizenCount
	const binfOff = pos + SAV_CITY_LEN_1 + citizenCount * SAV_CTZN_SIZE;
	const buildingCount = r.i32(binfOff + 8);
	const buildingsOff = binfOff + SAV_CITY_LEN_2;
	const bitmOff = buildingsOff + buildingCount * SAV_CITY_BUILDING_SIZE;

	const buildings = [];
	for (let b = 0; b < buildingCount; b++) {
		const e = buildingsOff + b * SAV_CITY_BUILDING_SIZE;
		const builtByPlayer = r.i32(e + 4);
		const usable = ((r.u8(bitmOff + 8 + (b >> 3)) >> (b & 7)) & 1) === 1;
		if (builtByPlayer !== -1 && usable) {
			buildings.push({ index: b, year: r.i32(e), culture: r.i32(e + 8) });
		}
	}

	return {
		id: r.i32(pos + 8),
		owner,
		name: r.str(pos + 392, 24),
		x: r.i16(pos + 12),
		y: r.i16(pos + 14),
		size: citizenCount,
		civilDisorder: r.bit(flags, 0),
		weLoveTheKingDay: r.bit(flags, 1),
		freshWater: r.bit(flags, 5),
		constructing: r.i32(pos + 52),
		constructingType: r.i32(pos + 56),
		culturePerTurn: r.i32(pos + 220),
		buildings,
	};
}

function readUnits(r, pos, numberOfUnits, out) {
	let cursor = pos;
	for (let i = 0; i < numberOfUnits; i++) {
		const off = cursor;
		const hasIdls = r.bit(off + 472, 1); // Flags3[3] bit 1
		out.push({
			id: r.i32(off + 8),
			x: r.i32(off + 12),
			y: r.i32(off + 16),
			owner: r.i32(off + 28),
			nationality: r.i32(off + 32),
			barbTribe: r.i32(off + 36),
			unitType: r.i32(off + 40),
			experienceLevel: r.i32(off + 44),
			damage: r.i32(off + 52),
			movementUsed: r.i32(off + 56),
			workerJob: r.i32(off + 64),
			fortified: r.bit(off + 76, 0),
			automated: r.bit(off + 76, 4),
			name: r.str(off + 92, 60),
		});
		cursor += SAV_UNIT_SIZE + (hasIdls ? SAV_IDLS_SIZE : 0);
	}
	return cursor;
}

function skipRpls(r, pos) {
	const rpltLength = r.i32(pos + 4);
	let cursor = pos + 8;
	for (let i = 0; i < rpltLength; i++) {
		const eventCount = r.i32(cursor + 13);
		cursor += SAV_RPLT_SIZE;
		for (let j = 0; j < eventCount; j++) {
			cursor += SAV_RPLE_SIZE;
			while (cursor < r.length && r.u8(cursor) !== 0) cursor++;
			cursor++; // skip NUL
		}
	}
	return cursor;
}

function skipHist(r, pos, game) {
	const turnCount = r.i32(pos + 4);
	let cursor = pos + SAV_HIST_SIZE;
	for (let i = 0; i < turnCount; i++) {
		const remainingCivs = r.i32(cursor + 8);
		cursor += SAV_TURN_SIZE;
		const perCiv = game && game.victoryLocations ? 5 : 4;
		cursor += remainingCivs * perCiv * 4;
	}
	return cursor;
}

function readLeads(r, pos, counts, leads, continentCount) {
	let cursor = pos;
	for (let i = 0; i < LEAD_COUNT; i++) {
		const leadOff = cursor;
		const playerId = r.i32(leadOff + 8);
		const raceId = r.i32(leadOff + 12);
		const capitalCity = r.i32(leadOff + 24);
		const gold = r.i32(leadOff + 48) + r.i32(leadOff + 52);
		const score = r.f32(leadOff + 56);
		const government = r.i32(leadOff + 140);
		const era = r.i32(leadOff + 224);
		const color = r.i32(leadOff + 1876);
		const leaderName = r.str(leadOff + 1896, 32);
		const title = r.str(leadOff + 1928, 24);
		const name = r.str(leadOff + 1952, 40);
		const noun = r.str(leadOff + 1992, 40);
		const adjective = r.str(leadOff + 2032, 40);

		cursor += LEAD_LEN_1;
		cursor += LEAD_COUNT * LEAD_LEAD_SIZE; // reputation relationships
		cursor += LEAD_LEN_2;

		// Per-leader diplomacy lists.
		for (let j = 0; j < LEAD_COUNT; j++) {
			const entryCount = r.i32(cursor);
			cursor += 4 + entryCount * 12;
		}

		if (raceId !== -1) {
			cursor += counts.bldg * (2 + 2 + 2 + 4 + 1);
			cursor += counts.prto * (2 + 2 + 2);
			cursor += counts.spaceshipParts * 2;
			cursor += counts.good * LEAD_COUNT * LEAD_GOOD_LEAD_SIZE;
			cursor += counts.good * 1;
			cursor += continentCount * 16; // unknown per-continent data
			cursor += continentCount * 4; // city counts
		}

		const scienceQueueSize = r.i32(cursor + (LEAD_LEN_3 - 4));
		cursor += LEAD_LEN_3;
		cursor += scienceQueueSize * 4;
		cursor += LEAD_LEN_4;

		leads[i] = {
			index: i, playerId, raceId, capitalCity, gold, score, government, era,
			color, leaderName, title, name, noun, adjective,
		};
	}
	return cursor;
}

function readSavTile(r, off, tile, biq) {
	const flags2 = off + 52;
	const baseIdx = r.u8(flags2 + 5) & 0x0f;
	const overlayIdx = (r.u8(flags2 + 5) & 0xf0) >> 4;

	tile.baseTerrain = terrainKey(biq, baseIdx);
	tile.overlayTerrain = terrainKey(biq, overlayIdx);
	tile.continent = r.i16(off + 34);
	tile.owner = r.u8(off + 9);
	tile.riverEdges = r.u8(off + 8);
	tile.textureFile = r.u8(off + 21);
	tile.textureLocation = r.u8(off + 20);
	tile.cityId = r.i16(off + 30);
	tile.colonyId = r.i16(off + 32);
	tile.barbTribe = r.i16(off + 28);

	const resourceId = r.i32(off + 12);
	tile.resource = resourceId >= 0 ? biq.rules.resources[resourceId]?.key ?? null : null;

	tile.improvements.road = r.bit(flags2, 0);
	tile.improvements.railroad = r.bit(flags2, 1);
	tile.improvements.mine = r.bit(flags2, 2);
	tile.improvements.irrigation = r.bit(flags2, 3);
	tile.improvements.fortress = r.bit(flags2, 4);
	tile.improvements.barricade = r.bit(flags2 + 3, 4);
	tile.improvements.airfield = r.bit(flags2 + 3, 5);
	tile.improvements.radarTower = r.bit(flags2 + 3, 6);
	tile.improvements.outpost = r.bit(flags2 + 3, 7);

	tile.features.goodyHut = r.bit(flags2, 5);
	tile.features.pollution = r.bit(flags2, 6);
	tile.features.craters = r.bit(flags2 + 1, 0);
	tile.features.ruins = r.u8(off + 40) !== 0;
	tile.features.bonusShield = r.bit(flags2 + 10, 0);
	tile.features.snowCapped = r.bit(flags2 + 10, 4);
	tile.features.pineForest = r.bit(flags2 + 10, 5);
	tile.features.barbarianCamp = r.i16(off + 28) >= 0;

	tile.exploredBy = r.maskToIndices(off + 84);
	// VisibleTo / VisibleTo2 / VisibleTo3 are all "currently visible" (spec D1).
	tile.visibleTo = r.maskToIndices(off + 88);
	for (const k of r.maskToIndices(off + 92)) if (!tile.visibleTo.includes(k)) tile.visibleTo.push(k);
	for (const k of r.maskToIndices(off + 96)) if (!tile.visibleTo.includes(k)) tile.visibleTo.push(k);
}

function terrainKey(biq, index) {
	return biq.rules.terrains[index]?.key ?? DEFAULT_TERRAIN_KEYS[index] ?? 'grassland';
}

/** True when every remaining byte is 0x00 or 0xFF (trailing alignment padding). */
function isPadding(r, pos, end) {
	for (let i = pos; i < end; i++) {
		const b = r.u8(i);
		if (b !== 0x00 && b !== 0xff) return false;
	}
	return true;
}

function resolveProducible(rules, constructing, constructingType) {
	if (constructingType === 0 || (constructingType === 1 && constructing === 29)) return 'Wealth';
	if (constructingType === 1) return rules.buildings[constructing]?.name ?? `Building ${constructing}`;
	if (constructingType === 2) return rules.unitTypes[constructing]?.name ?? `Unit ${constructing}`;
	return '';
}

// ---- Model assembly -----------------------------------------------------

function buildSavPlayers(leads, biq, game) {
	const players = [];
	for (let i = 0; i < LEAD_COUNT; i++) {
		const lead = leads[i];
		if (!lead || lead.raceId === -1) continue;
		const race = biq.rules.civilizations[lead.raceId];
		const player = createPlayer(i);
		player.civName = race?.name || lead.name || `Player ${i + 1}`;
		player.adjective = race?.adjective || lead.adjective || '';
		player.leaderName = lead.leaderName || race?.leaderName || '';
		player.primaryColor = lead.color >= 0 ? lead.color : race?.defaultColor ?? i;
		player.human = game ? ((game.humanPlayers >>> i) & 1) === 1 : false;
		player.alive = game ? ((game.remainingPlayers >>> i) & 1) === 1 : true;
		player.barbarian = lead.raceId === 0;
		player.gold = lead.gold;
		player.score = Math.round(lead.score || 0);
		players.push(player);
	}
	return players;
}
