import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	getMapCoordinates, sparseIndex, isRealTile, tileIndex, createTileGrid,
} from '../js/model.js';

test('sparse tile index -> (x, y) matches ImportCiv3.GetMapCoordinates', () => {
	// Formula: Y = i / (w/2); X = (i % (w/2)) * 2 + Y % 2.
	assert.deepEqual(getMapCoordinates(0, 4), { x: 0, y: 0 });
	assert.deepEqual(getMapCoordinates(1, 4), { x: 2, y: 0 });
	assert.deepEqual(getMapCoordinates(2, 4), { x: 1, y: 1 });
	assert.deepEqual(getMapCoordinates(3, 4), { x: 3, y: 1 });
	assert.deepEqual(getMapCoordinates(4, 4), { x: 0, y: 2 });
	assert.deepEqual(getMapCoordinates(0, 100), { x: 0, y: 0 });
	assert.deepEqual(getMapCoordinates(49, 100), { x: 98, y: 0 });
	assert.deepEqual(getMapCoordinates(50, 100), { x: 1, y: 1 });
});

test('sparse index and coordinates round-trip', () => {
	for (const width of [4, 8, 100]) {
		const height = 10;
		const count = (width * height) / 2;
		for (let i = 0; i < count; i++) {
			const { x, y } = getMapCoordinates(i, width);
			assert.equal(isRealTile(x, y), true);
			assert.equal(sparseIndex(x, y, width), i);
		}
	}
});

test('only even-parity cells are real', () => {
	assert.equal(isRealTile(0, 0), true);
	assert.equal(isRealTile(1, 1), true);
	assert.equal(isRealTile(1, 0), false);
	assert.equal(isRealTile(0, 1), false);
});

test('dense grid has a tile for exactly half the cells', () => {
	const width = 6;
	const height = 4;
	const grid = createTileGrid(width, height);
	assert.equal(grid.length, width * height);
	assert.equal(grid.filter(Boolean).length, (width * height) / 2);
	assert.ok(grid[tileIndex(2, 2, width)]);
	assert.equal(grid[tileIndex(3, 2, width)], null);
});
