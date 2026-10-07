import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSav } from '../js/importer/sav.js';
import { ByteWriter } from './helpers.js';

const BIQ_SECTION_START = 562;
const DEFAULT_COUNTS = { good: 26, bldg: 83, prto: 141, tech: 83, spaceship: 10 };

/**
 * Build a small, synthetic Conquests-format SAV byte-by-byte from the
 * documented offsets. No real game file is used or shipped.
 *
 * Map: 2 x 2 (two sparse tiles). Players: LEAD 0 (barbarian) and 1.
 * One city and one unit.
 */
function buildSyntheticSav() {
	const counts = DEFAULT_COUNTS;
	const gameFixed = 856;
	const arrays =
		1 * 4 + // CitiesPerContinent
		counts.tech * 4 +
		counts.bldg * 4 +
		counts.bldg * 1 +
		counts.bldg * 4 +
		counts.bldg * 4 +
		counts.prto * 4 +
		counts.prto * 4 +
		counts.tech * 4;
	const gameSize = gameFixed + arrays;

	const leadBase = 412 + 32 * 76 + 2696 + 32 * 4 + 108 + 292;
	const leadDynamic =
		counts.bldg * 11 + counts.prto * 6 + counts.spaceship * 2 + counts.good * 96 + counts.good + 1 * 16 + 1 * 4;
	const leadSize = (raceId) => leadBase + (raceId === -1 ? 0 : leadDynamic);

	const citySize = 556 + 2 * 308 + 12 + 0 + 140;
	const unitSize = 480;

	const raceIds = new Array(32).fill(-1);
	raceIds[0] = 0;
	raceIds[1] = 1;

	let total = BIQ_SECTION_START + gameSize + 242 + 2 * 212 + 16 + counts.good * 4;
	for (const raceId of raceIds) total += leadSize(raceId);
	total += citySize + unitSize + 64;

	const w = new ByteWriter(total);

	// Container header.
	w.tag(0, 'CIV3');
	w.i16(4, 0x1a);
	w.i32(6, 24);
	w.i32(10, 13);
	w.i32(38, 0); // no embedded BIQ

	let p = BIQ_SECTION_START;

	// GAME
	w.tag(p, 'GAME');
	w.i32(p + 4, gameFixed);
	w.i32(p + 32, 1); // NumberOfUnits
	w.i32(p + 36, 1); // NumberOfCities
	w.i32(p + 64, 7); // TurnNumber
	w.i32(p + 68, -3500); // GameYear
	w.u32(p + 80, 0b10); // HumanPlayers
	w.u32(p + 84, 0b11); // RemainingPlayers
	w.u32(p + 88, 0b11); // RemainingRaces
	w.i32(p + 300, 1); // NumberOfContinents
	w.i32(p + 304, 2); // NumberOfPlayers
	p += gameSize;

	// WRLD
	w.tag(p, 'WRLD');
	w.i16(p + 8, 1); // ContinentCount
	w.i32(p + 22, 2); // Height
	w.i32(p + 42, 2); // Width
	w.i32(p + 174, 12345); // WorldSeed
	w.u8(p + 178, 0b1); // XWrapping
	p += 242;

	// TILE (2 tiles)
	w.tag(p, 'TILE');
	const t0 = p;
	w.u8(t0 + 8, 0b101); // river N + E
	w.i32(t0 + 12, -1); // no resource
	w.u8(t0 + 52 + 5, 0x02); // base terrain 2 (grassland)
	w.u32(t0 + 84, 0b1); // explored by player 0
	w.u32(t0 + 88, 0b1); // visible to player 0
	const t1 = p + 212;
	w.i32(t1 + 12, 0); // resource 0 (Horses)
	w.u8(t1 + 52 + 5, 0x0d); // base terrain 13 (ocean)
	w.u32(t1 + 84, 0b11);
	w.u32(t1 + 92, 0b10); // VisibleTo2 -> player 1
	p += 2 * 212;

	// CONT + ResourceCounts
	w.tag(p, 'CONT');
	w.i32(p + 4, 8);
	w.u8(p + 8, 1);
	w.i32(p + 12, 2);
	p += 16 + counts.good * 4;

	// LEAD
	for (let i = 0; i < 32; i++) {
		const raceId = raceIds[i];
		w.tag(p, 'LEAD');
		w.i32(p + 8, i); // PlayerID
		w.i32(p + 12, raceId); // RaceID
		w.i32(p + 24, i === 1 ? 0 : -1); // CapitalCity (city index 0 for player 1)
		w.i32(p + 48, 10); // Gold1
		w.f32(p + 56, 42.5); // Score
		w.i32(p + 140, 0); // Government
		w.i32(p + 1876, i); // Color
		w.str(p + 1896, `Leader ${i}`);
		w.str(p + 1952, `Civ ${i}`);
		w.str(p + 2032, `Civic ${i}`);
		p += leadSize(raceId);
	}

	// CITY (one valid city)
	w.tag(p, 'CITY');
	w.i32(p + 4, 136); // VALID_CITY_LENGTH
	w.i32(p + 8, 5); // ID
	w.i16(p + 12, 1); // X
	w.i16(p + 14, 1); // Y
	w.u8(p + 16, 1); // Owner
	w.u8(p + 24, 1 << 5); // fresh water access
	w.i32(p + 52, 0); // Constructing
	w.i32(p + 56, 1); // ConstructingType = building
	w.i32(p + 60, -2000); // YearBuilt
	w.i32(p + 220, 2); // CulturePerTurn
	w.i32(p + 552, 2); // POPD.CitizenCount
	w.i32(p + 556 + 2 * 308 + 8, 0); // BINF.BuildingCount
	w.str(p + 392, 'Testville');
	p += citySize;

	// UNIT (one unit)
	w.tag(p, 'UNIT');
	w.i32(p + 4, unitSize);
	w.i32(p + 8, 9); // ID
	w.i32(p + 12, 1); // X
	w.i32(p + 16, 1); // Y
	w.i32(p + 28, 1); // OwnerID
	w.i32(p + 32, 1); // Nationality
	w.i32(p + 40, 0); // UnitType
	w.i32(p + 44, 1); // ExperienceLevel
	w.i32(p + 64, -1); // WorkerJob
	w.u8(p + 76, 0b1); // fortified
	w.str(p + 92, 'TestArcher');
	w.u8(p + 472, 0); // no IDLS
	p += unitSize;

	return w.bytes().slice(0, p);
}

test('parses a synthetic Conquests SAV', () => {
	const world = parseSav(buildSyntheticSav(), 'synthetic.SAV');

	assert.equal(world.source, 'civ3-sav');
	assert.equal(world.width, 2);
	assert.equal(world.height, 2);
	assert.equal(world.wrapX, true);
	assert.equal(world.wrapY, false);
	assert.equal(world.seed, 12345);
	assert.equal(world.turn, 7);
	assert.equal(world.year, -3500);

	// Two real tiles (dense grid has four cells, half are placeholders).
	assert.equal(world.tiles.filter(Boolean).length, 2);

	const t0 = world.tiles[0]; // (0, 0)
	assert.equal(t0.x, 0);
	assert.equal(t0.y, 0);
	assert.equal(t0.baseTerrain, 'grassland');
	assert.equal(t0.riverEdges, 0b101);
	assert.deepEqual(t0.exploredBy, [0]);
	assert.deepEqual(t0.visibleTo, [0]);

	const t1 = world.tiles[3]; // (1, 1) -> index y*width+x = 3
	assert.equal(t1.baseTerrain, 'ocean');
	assert.equal(t1.resource, 'Horses');
	assert.deepEqual(t1.exploredBy, [0, 1]);
	assert.deepEqual(t1.visibleTo, [1]);
});

test('players come from LEAD, skipping unused slots', () => {
	const world = parseSav(buildSyntheticSav(), 'synthetic.SAV');
	assert.equal(world.players.length, 2);
	assert.equal(world.players[0].id, 0);
	assert.equal(world.players[0].barbarian, true);
	assert.equal(world.players[1].id, 1);
	assert.equal(world.players[1].human, true);
	assert.equal(world.players[1].gold, 10);
	assert.equal(world.players[1].score, 43);
});

test('parses the city and unit records', () => {
	const world = parseSav(buildSyntheticSav(), 'synthetic.SAV');
	assert.equal(world.cities.length, 1);
	const city = world.cities[0];
	assert.equal(city.name, 'Testville');
	assert.equal(city.owner, 1);
	assert.equal(city.size, 2);
	assert.equal(city.capital, true);
	assert.equal(city.freshWater, true);
	assert.equal(city.producing, 'Building 0'); // default building list index 0

	assert.equal(world.units.length, 1);
	const unit = world.units[0];
	assert.equal(unit.prototype, 'Unit 0'); // default unit list index 0
	assert.equal(unit.name, 'TestArcher');
	assert.equal(unit.x, 1);
	assert.equal(unit.y, 1);
	assert.equal(unit.fortified, true);
	assert.equal(unit.hp, 3); // regular base 3, no bonus, no damage
});

test('rejects a file with no WRLD section', () => {
	const bytes = new Uint8Array(600);
	bytes.set([0x43, 0x49, 0x56, 0x33], 0); // CIV3
	assert.throws(() => parseSav(bytes, 'broken.SAV'), /WRLD/);
});
