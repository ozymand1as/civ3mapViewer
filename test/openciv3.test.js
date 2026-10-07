import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseOpenCiv3 } from '../js/importer/openciv3.js';

function fixture(overrides = {}) {
	return {
		version: '0.0.0',
		seed: 99,
		turnNumber: 12,
		map: {
			tilesWide: 4,
			tilesTall: 4,
			wrapHorizontally: true,
			wrapVertically: false,
			tiles: [
				{ x: 0, y: 0, baseTerrain: 'grassland', overlayTerrain: 'grassland', features: ['riverNorth'] },
				{ x: 1, y: 1, baseTerrain: 'hills', overlayTerrain: 'hills', resource: 'Iron', overlays: ['road', 'mine'] },
				{ x: 2, y: 2, baseTerrain: 'ocean', overlayTerrain: 'ocean', features: ['barbarianCamp'] },
			],
			startingLocations: [{ x: 0, y: 0 }],
		},
		terrainTypes: [
			{ key: 'grassland', displayName: 'Grassland' },
			{ key: 'hills', displayName: 'Hills' },
			{ key: 'ocean', displayName: 'Ocean' },
		],
		resources: [{ key: 'Iron', name: 'Iron', category: 'strategic' }],
		unitPrototypes: [{ name: 'Warrior', movement: 1, hpBonus: 0, categories: [] }],
		buildings: [{ name: 'Barracks' }],
		civilizations: [
			{ name: 'Rome', adjective: 'Roman', leader: 'Caesar', primaryColorIndex: 5, isBarbarian: false },
		],
		players: [
			{
				id: 'player-1',
				civilization: 'Rome',
				human: true,
				defeated: false,
				primaryColorIndex: 5,
				gold: 30,
				tileKnowledge: [
					{ x: 0, y: 0 },
					{ x: 1, y: 1 },
				],
			},
		],
		cities: [
			{
				id: 'city-1',
				owner: 'player-1',
				capital: true,
				location: { x: 0, y: 0 },
				name: 'Roma',
				size: 3,
				producible: 'Warrior',
				buildings: [{ building: 'Barracks', year: -1000, totalCulture: 4 }],
			},
		],
		units: [
			{
				id: 'unit-1',
				name: '',
				nationality: 'Rome',
				prototype: 'Warrior',
				owner: 'player-1',
				currentLocation: { x: 1, y: 1 },
				hitPointsRemaining: 2,
				movePointsRemaining: 0.5,
				action: 'fortified',
				experience: 'veteran',
				isAutomated: false,
			},
		],
		...overrides,
	};
}

test('parses an OpenCiv3 JSON save', () => {
	const world = parseOpenCiv3(fixture(), 'save.json');

	assert.equal(world.source, 'openciv3-json');
	assert.equal(world.width, 4);
	assert.equal(world.height, 4);
	assert.equal(world.wrapX, true);
	assert.equal(world.wrapY, false);
	assert.equal(world.turn, 12);
	assert.equal(world.seed, 99);

	assert.equal(world.rules.terrains.length, 3);
	assert.equal(world.rules.resources[0].type, 1); // strategic

	const t0 = world.tiles[0];
	assert.equal(t0.baseTerrain, 'grassland');
	assert.equal(t0.riverEdges, 1 << 0);

	const t1 = world.tiles[1 * 4 + 1];
	assert.equal(t1.resource, 'Iron');
	assert.equal(t1.improvements.road, true);
	assert.equal(t1.improvements.mine, true);
	assert.deepEqual(t1.exploredBy, [1]);
	assert.deepEqual(t1.visibleTo, [1]);

	assert.equal(world.cities.length, 1);
	assert.equal(world.cities[0].name, 'Roma');
	assert.equal(world.cities[0].capital, true);
	assert.equal(world.cities[0].buildings[0].name, 'Barracks');

	assert.equal(world.units.length, 1);
	assert.equal(world.units[0].prototype, 'Warrior');
	assert.equal(world.units[0].name, 'Warrior'); // falls back to prototype
	assert.equal(world.units[0].fortified, true);
	assert.equal(world.units[0].hp, 2);

	assert.equal(world.startingLocations.length, 1);
	assert.equal(world.visibilityApproximated, true);
});

test('treats missing fields as defaults', () => {
	const data = fixture();
	delete data.map.wrapHorizontally;
	delete data.players[0].gold;
	const world = parseOpenCiv3(data, 'save.json');
	assert.equal(world.wrapX, false);
	assert.equal(world.players[0].gold, 0);
});

test('rejects JSON that is not an OpenCiv3 save', () => {
	assert.throws(() => parseOpenCiv3({}, 'x.json'), /map dimensions/);
	assert.throws(() => parseOpenCiv3('null', 'x.json'), /save object/);
});
