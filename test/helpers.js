/** Small little-endian byte writer used to build synthetic test fixtures. */

export class ByteWriter {
	constructor(size) {
		this.buf = new Uint8Array(size);
		this.view = new DataView(this.buf.buffer);
	}

	u8(o, v) { this.view.setUint8(o, v); }
	i8(o, v) { this.view.setInt8(o, v); }
	u16(o, v) { this.view.setUint16(o, v, true); }
	i16(o, v) { this.view.setInt16(o, v, true); }
	u32(o, v) { this.view.setUint32(o, v, true); }
	i32(o, v) { this.view.setInt32(o, v, true); }
	f32(o, v) { this.view.setFloat32(o, v, true); }

	tag(o, text) {
		for (let i = 0; i < text.length; i++) this.buf[o + i] = text.charCodeAt(i);
	}

	/** Windows-1252 / ASCII string with a trailing NUL. */
	str(o, text) {
		for (let i = 0; i < text.length; i++) this.buf[o + i] = text.charCodeAt(i) & 0xff;
		this.buf[o + text.length] = 0;
	}

	bytes() {
		return this.buf;
	}
}
