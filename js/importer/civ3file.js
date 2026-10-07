/**
 * Civ3 container header: version detection, section scanning, string reads.
 *
 * Clean-room port of `QueryCiv3/QueryCiv3.cs` (`Civ3File`) — MIT.
 */

import { BinReader } from './binreader.js';

export const FileVersion = Object.freeze({
	VANILLA: 'vanilla',
	PTW: 'ptw',
	CONQUESTS: 'conquests',
});

/** @typedef {{name: string, offset: number}} Civ3Section */
/** @typedef {{fileTypeName: string, magicNumber: number, major: number, minor: number, game: string}} Civ3Version */

export class Civ3File {
	/** @param {Uint8Array} bytes decompressed file bytes */
	constructor(bytes) {
		this.reader = new BinReader(bytes);
		this.bytes = this.reader.bytes;
		this.length = this.reader.length;

		this.isGameFile = this.#matches([0x43, 0x49, 0x56, 0x33]); // CIV3
		this.isBicFile = bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x49 && bytes[2] === 0x43; // BIC

		/** @type {Civ3Section[]} */
		this.sections = this.#populateSections();
		this.version = this.#populateVersion();
	}

	#matches(sig) {
		if (this.length < sig.length) return false;
		for (let i = 0; i < sig.length; i++) if (this.bytes[i] !== sig[i]) return false;
		return true;
	}

	/** @returns {Civ3Version} */
	#populateVersion() {
		let header = '';
		let magic = -1;
		let major = -1;
		let minor = -1;

		if (this.isGameFile) {
			header = this.reader.str(0, 4);
			magic = this.reader.i16(4);
			major = this.reader.i32(6);
			minor = this.reader.i32(10);
		} else if (this.isBicFile) {
			header = this.reader.str(0, 4);
			major = this.reader.i32(24);
			minor = this.reader.i32(28);
		}

		let game = FileVersion.CONQUESTS;
		const h = header.trim();
		if ((h === 'BICX' || h === 'BICQ') && major === 12) game = FileVersion.CONQUESTS;
		else if (h === 'BICX') game = FileVersion.PTW;
		else if (h.startsWith('BIC')) game = FileVersion.VANILLA;
		else if (h === 'CIV3') game = FileVersion.CONQUESTS;

		return { fileTypeName: header, magicNumber: magic, major, minor, game };
	}

	/**
	 * Naive scan for 4-character printable-ASCII section tags ("[0x20..0x5a]").
	 * Used as a fallback for BIQ files; SAV uses a deterministic walk.
	 * @returns {Civ3Section[]}
	 */
	#populateSections() {
		const out = [];
		let count = 0;
		let offset = 0;
		const data = this.bytes;
		for (let i = 0; i < data.length; i++) {
			if (data[i] < 0x20 || data[i] > 0x5a) {
				count = 0;
			} else {
				if (count === 0) offset = i;
				count++;
			}
			if (count > 3) {
				count = 0;
				out.push({ name: this.reader.str(offset, 4), offset });
			}
		}
		return out;
	}

	sectionExists(name) {
		return this.sections.some((s) => s.name === name);
	}

	/**
	 * Offset of the payload of the nth section called `name` (just past the tag).
	 * @param {string} name
	 * @param {number} [nth]
	 */
	sectionOffset(name, nth = 1) {
		let n = 0;
		for (const s of this.sections) {
			if (s.name === name) {
				n++;
				if (n >= nth) return s.offset + name.length;
			}
		}
		throw new Error(`Unable to find section '${name}' nth ${nth}`);
	}

	readInt32(off) { return this.reader.i32(off); }
	readInt16(off) { return this.reader.i16(off); }
	readByte(off) { return this.reader.u8(off); }
	getBytes(off, len) { return this.reader.bytesAt(off, len); }
	getString(off, len) { return this.reader.str(off, len); }
}
