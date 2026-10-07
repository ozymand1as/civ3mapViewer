import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blastDecompress, isBlastCompressed, BlastError } from '../js/importer/blast.js';

// Known answer from blast.c: the 8-byte stream below decompresses to
// "AIAIAIAIAIAIA" (see the comment at the top of contrib/blast/blast.c).
const KNOWN = new Uint8Array([0x00, 0x04, 0x82, 0x24, 0x25, 0x8f, 0x80, 0x7f]);

test('decode the blast.c known-answer vector', () => {
	const out = blastDecompress(KNOWN);
	assert.equal(new TextDecoder().decode(out), 'AIAIAIAIAIAIA');
});

test('detects the PKWARE header', () => {
	assert.equal(isBlastCompressed(KNOWN), true);
	for (const second of [4, 5, 6]) {
		assert.equal(isBlastCompressed(new Uint8Array([0x00, second, 0, 0])), true);
	}
	assert.equal(isBlastCompressed(new Uint8Array([0x00, 0x03, 0, 0])), false);
	assert.equal(isBlastCompressed(new Uint8Array([0x43, 0x49, 0x56, 0x33])), false);
});

test('rejects an invalid literal flag', () => {
	// First byte must be 0 or 1.
	assert.throws(() => blastDecompress(new Uint8Array([0x07, 0x06, 0x00, 0x00])), BlastError);
});

test('rejects an invalid dictionary size', () => {
	// Second byte must be 4..6.
	assert.throws(() => blastDecompress(new Uint8Array([0x00, 0x09, 0x00, 0x00])), BlastError);
});

test('rejects truncated input instead of hanging', () => {
	assert.throws(() => blastDecompress(new Uint8Array([0x00, 0x06])), BlastError);
});

test('enforces an output size cap', () => {
	// A long run-length copy would exceed a tiny cap.
	assert.throws(() => blastDecompress(KNOWN, { maxOutput: 4 }), BlastError);
});
