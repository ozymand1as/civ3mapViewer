/**
 * PKWARE Data Compression Library "implode" (DCL) decompressor.
 *
 * Civ3 `.sav`/`.biq`/`.bic` files may be compressed with this format; it is
 * detected by the header `00 04`, `00 05` or `00 06`.
 *
 * This is a JavaScript port of Mark Adler's public-domain `blast.c`
 * (contrib/blast, zlib), via the OpenCiv3 C# translation (Apache-2.0, James
 * Telfer). See LICENSE for the full notices.
 *
 * This module is dependency-free so it can run inside a Web Worker and in
 * Node's test runner.
 */

/** Error thrown for malformed compressed input. */
export class BlastError extends Error {
	constructor(message) {
		super(message);
		this.name = 'BlastError';
	}
}

export const MAX_WIN = 4096;
const END_OF_STREAM = 519;
const MAX_BITS = 13;

// Compacted canonical code-length tables from blast.c.
const LITERAL_BIT_LENGTHS = [
	11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8,
	9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5,
	7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12,
	8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27,
	44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45,
	44, 173,
];
const LENGTH_BIT_LENGTHS = [2, 35, 36, 53, 38, 23];
const DISTANCE_BIT_LENGTHS = [2, 20, 53, 230, 247, 151, 248];

const LENGTH_CODE_BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const LENGTH_CODE_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

class HuffmanTable {
	constructor(symbolSize, rep) {
		this.count = new Int16Array(MAX_BITS + 1);
		this.symbol = new Int16Array(symbolSize);
		this.#construct(rep);
	}

	#construct(rep) {
		const length = new Int16Array(256);
		let symbol = 0;
		for (let ri = 0; ri < rep.length; ri++) {
			let len = rep[ri];
			let left = (len >> 4) + 1;
			len &= 0xf;
			do {
				length[symbol++] = len;
			} while (--left > 0);
		}

		const n = symbol;
		this.count.fill(0);
		for (symbol = 0; symbol < n; symbol++) this.count[length[symbol]]++;
		if (this.count[0] === n) return; // no codes

		let left = 1;
		for (let len = 1; len <= MAX_BITS; len++) {
			left <<= 1;
			left -= this.count[len];
			if (left < 0) return; // over-subscribed
		}

		const offs = new Int16Array(MAX_BITS + 1);
		offs[1] = 0;
		for (let len = 1; len < MAX_BITS; len++) offs[len + 1] = offs[len] + this.count[len];
		for (symbol = 0; symbol < n; symbol++) {
			if (length[symbol] !== 0) this.symbol[offs[length[symbol]]++] = symbol;
		}
	}
}

const LITERAL_CODE = new HuffmanTable(256, LITERAL_BIT_LENGTHS);
const LENGTH_CODE = new HuffmanTable(16, LENGTH_BIT_LENGTHS);
const DISTANCE_CODE = new HuffmanTable(64, DISTANCE_BIT_LENGTHS);

class InputBuffer {
	constructor(bytes) {
		this.bytes = bytes;
		this.pos = 0;
	}
	get remaining() {
		return this.bytes.length - this.pos;
	}
	hasInput() {
		return this.pos < this.bytes.length;
	}
	consumeByte() {
		if (this.pos >= this.bytes.length) throw new BlastError('Unexpected end of compressed input');
		return this.bytes[this.pos++];
	}
}

class BitStream {
	constructor(input) {
		this.input = input;
		this.bitBuffer = 0;
		this.bitBufferCount = 0;
	}

	getBits(need) {
		let val = this.bitBuffer;
		while (this.bitBufferCount < need) {
			val |= this.input.consumeByte() << this.bitBufferCount;
			this.bitBufferCount += 8;
		}
		this.bitBuffer = val >> need;
		this.bitBufferCount -= need;
		return val & ((1 << need) - 1);
	}

	flushBits() {
		this.bitBufferCount = 0;
	}
}

/**
 * Streaming-compatible decoder producing one Uint8Array.
 *
 * @param {Uint8Array} input compressed bytes
 * @param {{maxOutput?: number}} [options] maxOutput guards against corrupt input
 * @returns {Uint8Array}
 */
export function blastDecompress(input, options = {}) {
	const maxOutput = options.maxOutput ?? 512 * 1024 * 1024;
	const inputBuffer = new InputBuffer(input);
	const bits = new BitStream(inputBuffer);

	const buffer = new Uint8Array(MAX_WIN * 2);
	let pos = 0;
	/** @type {Uint8Array[]} */
	const chunks = [];
	let total = 0;

	const flushSection = (count) => {
		if (count <= 0) return;
		total += count;
		if (total > maxOutput) throw new BlastError('Decompressed output exceeds size limit');
		chunks.push(buffer.slice(0, count));
	};

	const ensureBufferSpace = (required) => {
		if (pos + required >= buffer.length) {
			const startWindowOffset = pos - MAX_WIN;
			flushSection(startWindowOffset);
			buffer.copyWithin(0, startWindowOffset, startWindowOffset + MAX_WIN);
			pos = MAX_WIN;
			return startWindowOffset;
		}
		return 0;
	};

	const writeBuffer = (b) => {
		ensureBufferSpace(1);
		buffer[pos++] = b;
	};

	const copyBufferSection = (fromIndex, copyCount) => {
		fromIndex -= ensureBufferSpace(copyCount);
		buffer.copyWithin(pos, fromIndex, fromIndex + copyCount);
		pos += copyCount;
	};

	const decode = (h) => {
		let len = 1;
		let code = 0;
		let first = 0;
		let index = 0;
		let next = 1;

		let bitbuf = bits.bitBuffer;
		let left = bits.bitBufferCount;

		for (;;) {
			while (left-- > 0) {
				code |= (bitbuf & 1) ^ 1;
				bitbuf >>= 1;
				const count = h.count[next++];
				if (code < first + count) {
					bits.bitBuffer = bitbuf;
					bits.bitBufferCount = (bits.bitBufferCount - len) & 7;
					return h.symbol[index + (code - first)];
				}
				index += count;
				first += count;
				first <<= 1;
				code <<= 1;
				len++;
			}
			left = MAX_BITS + 1 - len;
			if (left === 0) break;
			bitbuf = inputBuffer.consumeByte();
			if (left > 8) left = 8;
		}
		return -9; // invalid code
	};

	const readLengthDistance = (dictSize) => {
		const decodedLengthSymbol = decode(LENGTH_CODE);
		if (decodedLengthSymbol < 0) throw new BlastError('Invalid length code');
		const copyLength =
			LENGTH_CODE_BASE[decodedLengthSymbol] + bits.getBits(LENGTH_CODE_EXTRA[decodedLengthSymbol]);
		if (copyLength === END_OF_STREAM) return { copyLength, copyDist: 0 };

		const distanceAdditionalBits = copyLength === 2 ? 2 : dictSize;
		let copyDist = decode(DISTANCE_CODE) << distanceAdditionalBits;
		if (copyDist < 0) throw new BlastError('Invalid distance code');
		copyDist += bits.getBits(distanceAdditionalBits);
		copyDist++;
		if (copyDist > pos) throw new BlastError('Distance points before the start of the output');

		return { copyLength, copyDist };
	};

	const writeWindowSegment = (copyLength, copyDistance) => {
		do {
			let fromIndex = pos - copyDistance;
			let copyCount = copyDistance;
			if (copyCount > copyLength) copyCount = copyLength;
			copyBufferSection(fromIndex, copyCount);
			copyLength -= copyCount;
		} while (copyLength !== 0);
	};

	const decompressStream = () => {
		const codedLiteral = bits.getBits(8);
		if (codedLiteral > 1) throw new BlastError('Invalid literal flag in compressed header');
		const dictSize = bits.getBits(8);
		if (dictSize < 4 || dictSize > 6) throw new BlastError('Invalid dictionary size in compressed header');

		for (;;) {
			if (bits.getBits(1) === 0) {
				const literal = codedLiteral ? decode(LITERAL_CODE) : bits.getBits(8);
				if (literal < 0) throw new BlastError('Invalid literal code');
				writeBuffer(literal);
			} else {
				const { copyLength, copyDist } = readLengthDistance(dictSize);
				if (copyLength === END_OF_STREAM) break;
				writeWindowSegment(copyLength, copyDist);
			}
		}

		if (pos > 0) {
			flushSection(pos);
			pos = 0;
		}
		bits.flushBits();
	};

	do {
		decompressStream();
	} while (inputBuffer.hasInput());

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

/**
 * True if the first two bytes look like a PKWARE-compressed stream.
 * @param {Uint8Array} bytes
 */
export function isBlastCompressed(bytes) {
	return bytes.length >= 2 && bytes[0] === 0x00 && (bytes[1] === 0x04 || bytes[1] === 0x05 || bytes[1] === 0x06);
}

/**
 * Decompress if the header says compressed, otherwise return the input.
 * @param {Uint8Array} bytes
 */
export function maybeDecompress(bytes, options) {
	return isBlastCompressed(bytes) ? blastDecompress(bytes, options) : bytes;
}
