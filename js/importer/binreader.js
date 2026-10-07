/**
 * Little-endian binary reader over an ArrayBuffer / Uint8Array.
 *
 * Civ3 stores every multi-byte field little-endian and every string as
 * NUL-terminated Windows-1252. This module is the only place that knows about
 * byte order; the section parsers only use the helpers here.
 *
 * Clean-room port of QueryCiv3's `Civ3File`/`Util` accessors (MIT).
 */

/** Windows-1252 decoder. Falls back to latin1 if the runtime lacks the codec. */
let cp1252 = null;
function decoder() {
	if (cp1252) return cp1252;
	try {
		cp1252 = new TextDecoder('windows-1252');
	} catch {
		cp1252 = new TextDecoder('latin1');
	}
	return cp1252;
}

/**
 * Decode a Civ3 string: Windows-1252, truncated at the first NUL.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeCiv3String(bytes) {
	let end = bytes.indexOf(0);
	if (end === -1) end = bytes.length;
	return decoder().decode(bytes.subarray(0, end));
}

export class BinReader {
	/** @param {Uint8Array|ArrayBuffer} input */
	constructor(input) {
		this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
		this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
	}

	get length() {
		return this.bytes.byteLength;
	}

	u8(off) { return this.view.getUint8(off); }
	i8(off) { return this.view.getInt8(off); }
	u16(off) { return this.view.getUint16(off, true); }
	i16(off) { return this.view.getInt16(off, true); }
	u32(off) { return this.view.getUint32(off, true); }
	i32(off) { return this.view.getInt32(off, true); }
	f32(off) { return this.view.getFloat32(off, true); }

	/** @returns {Uint8Array} a copy of len bytes at off (clamped to EOF). */
	bytesAt(off, len) {
		const end = Math.min(off + len, this.length);
		if (off >= this.length) return new Uint8Array(0);
		return this.bytes.slice(off, end);
	}

	/** Windows-1252 string of `len` bytes at `off`, NUL-trimmed. */
	str(off, len) {
		return decodeCiv3String(this.bytesAt(off, len));
	}

	/** Test bit `index` of the byte at `off`. */
	bit(off, index) {
		return ((this.u8(off) >> index) & 1) === 1;
	}

	/** Test bit `index` of a 32-bit little-endian word at `off`. */
	bit32(off, index) {
		return ((this.u32(off) >>> index) & 1) === 1;
	}

	/** Expand a 32-bit mask at `off` into the list of set bit indices. */
	maskToIndices(off) {
		const mask = this.u32(off);
		const out = [];
		for (let k = 0; k < 32; k++) if ((mask >>> k) & 1) out.push(k);
		return out;
	}
}

/**
 * Read a whole File/Blob/ArrayBuffer into a Uint8Array.
 * @param {Blob|ArrayBuffer|Uint8Array} input
 * @returns {Promise<Uint8Array>}
 */
export async function toBytes(input) {
	if (input instanceof Uint8Array) return input;
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	if (typeof input.arrayBuffer === 'function') return new Uint8Array(await input.arrayBuffer());
	throw new TypeError('Unsupported input type');
}
