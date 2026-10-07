import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseBiq } from '../js/importer/biq.js';
import { ByteWriter } from './helpers.js';

const SECTION_HEADERS_START = 736;

/**
 * Build a minimal Conquests BIQ with a TERR section, a WMAP and a TILE section,
 * byte-by-byte from the documented layout. 4 x 2 map (4 sparse tiles).
 */
function buildSyntheticBiq() {
	const width = 4;
	const height = 2;
	const tileCount = (width * height) / 2; // 4

	// TERR: 2 terrains, no resources. Record = Length(4) + NumResources(4) + 225.
	const terrLen = 229; // Length field = 225 + 4 (the length int itself) - 4? see below
	// The parser computes recordSize = Length + 4 and expects 4 + 4 + bitmask + 225 bytes.
	// With no resources (bitmask 0) that is 233, so Length must be 229.
	const terrTotal = 2 * (terrLen + 4);

	// WMAP: Length + NumResources(0) + 164 fixed bytes = 172 bytes.
	const wmapTotal = 4 + 4 + 164;

	// TILE: 49 bytes each.
	const tileTotal = tileCount * 49;

	let offset = SECTION_HEADERS_START;
	const terrOff = offset;
	offset += 8 + terrTotal;
	const wmapOff = offset;
	offset += 8 + wmapTotal;
	const tileOff = offset;
	offset += 8 + tileTotal;

	const w = new ByteWriter(offset + 16);
	w.tag(0, 'BICX');
	w.i32(24, 12); // major = Conquests
	w.i32(28, 13);
	w.str(32, 'Synthetic description');
	w.str(672, 'Synthetic scenario');

	// TERR
	w.tag(terrOff, 'TERR');
	w.i32(terrOff + 4, 2);
	let t = terrOff + 8;
	for (const [i, name] of ['grassland', 'ocean'].entries()) {
		w.i32(t, terrLen);
		w.i32(t + 4, 0); // no possible resources
		w.str(t + 8, name);
		// ImpassableByWheeled etc. left as zero.
		t += terrLen + 4;
	}

	// WMAP
	w.tag(wmapOff, 'WMAP');
	w.i32(wmapOff + 4, 1);
	w.i32(wmapOff + 8, 168); // Length
	w.i32(wmapOff + 8 + 4, 0); // NumberOfResources
	const fixed = wmapOff + 8 + 8; // +8 for tag/count, +8 for Length/NumResources
	w.i32(fixed + 0, 1); // NumberOfContinents
	w.i32(fixed + 4, height); // Height
	w.i32(fixed + 24, width); // Width
	w.i32(fixed + 156, 0xabc); // MapSeed

	// TILE
	w.tag(tileOff, 'TILE');
	w.i32(tileOff + 4, tileCount);
	for (let i = 0; i < tileCount; i++) {
		const o = tileOff + 8 + i * 49;
		w.i32(o, 45); // Length
		w.u8(o + 38, (i === 0 ? 0x0d : 0x02)); // base terrain 13 (ocean) for first, else 2
	}

	return w.bytes().slice(0, offset);
}

test('parses a synthetic Conquests BIQ', () => {
	const world = parseBiq(buildSyntheticBiq(), 'synthetic.biq');

	assert.equal(world.source, 'civ3-biq');
	assert.equal(world.width, 4);
	assert.equal(world.height, 2);
	assert.equal(world.seed, 0xabc);
	assert.equal(world.warnings.length, 0);

	assert.equal(world.tiles.filter(Boolean).length, 4);
	assert.equal(world.rules.terrains.length, 2);
	assert.equal(world.rules.terrains[0].key, 'grassland');
	assert.equal(world.rules.terrains[1].key, 'ocean');

	// Index 0 -> (0,0); first tile is ocean (base terrain 13 -> second terrain).
	const first = world.tiles[0];
	assert.equal(first.baseTerrain, 'ocean');
	// Index 1 -> (2,0); second tile is grassland (base terrain 2 -> first terrain).
	const second = world.tiles[2];
	assert.equal(second.baseTerrain, 'grassland');
});

test('rejects garbage input gracefully', () => {
	// Too short to contain a section header.
	assert.doesNotThrow(() => parseBiq(new Uint8Array(10), 'tiny.biq'));
});
