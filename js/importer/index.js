/**
 * File-type detection and dispatch. Runs inside the parse worker.
 */

import { maybeDecompress, isBlastCompressed } from './blast.js';
import { parseSav } from './sav.js';
import { parseBiq } from './biq.js';
import { parseOpenCiv3 } from './openciv3.js';

/**
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {(stage: string, detail?: string) => void} [onProgress]
 * @returns {import('../model.js').WorldModel}
 */
export function importFile(bytes, name, onProgress = () => {}) {
	const ext = (name.split('.').pop() || '').toLowerCase();

	if (ext === 'json') {
		onProgress('parse', 'OpenCiv3 JSON');
		return parseOpenCiv3(decodeUtf8(bytes), name);
	}

	// Decompress once up front so we can sniff the header of the payload.
	onProgress('decompress');
	const decompressed = maybeDecompress(bytes);
	const head = String.fromCharCode(...decompressed.slice(0, 4));

	if (head.startsWith('CIV3')) {
		onProgress('sections', 'SAV');
		return parseSav(bytes, name);
	}
	if (head.startsWith('BIC')) {
		onProgress('sections', 'BIQ/BIC');
		return parseBiq(bytes, name);
	}

	// Compressed data whose payload we could not sniff: report clearly.
	if (isBlastCompressed(bytes)) {
		throw new Error('The file is PKWARE-compressed but its contents are not a Civ3 SAV or BIQ.');
	}
	throw new Error(
		`Unrecognised file "${name}". Expected a Civ3 .sav/.biq/.bic or an OpenCiv3 .json save.`
	);
}

function decodeUtf8(bytes) {
	return new TextDecoder('utf-8').decode(bytes);
}
