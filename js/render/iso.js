/**
 * Isometric geometry for Civ3's diamond-packed tile grid.
 *
 * Civ3 stores a map sparsely: only tiles where (x + y) is even exist, and each
 * real tile is a 2:1 diamond. Placing tile (x, y) at
 *
 *   screenX = x * (tileW / 2)
 *   screenY = y * (tileW / 4)
 *
 * makes those diamonds tile the plane exactly (matching OpenCiv3's renderer,
 * which uses `cellSize = (64, 32)` for a 128×64 tile sprite). Consequently the
 * four diagonal neighbours share an edge and the four cardinal neighbours meet
 * at a vertex.
 */

/** Civ3 tile directions and their (x, y) coordinate deltas. */
export const DIRECTIONS = [
	{ name: 'N', dx: 0, dy: -2 },
	{ name: 'NE', dx: 1, dy: -1 },
	{ name: 'E', dx: 2, dy: 0 },
	{ name: 'SE', dx: 1, dy: 1 },
	{ name: 'S', dx: 0, dy: 2 },
	{ name: 'SW', dx: -1, dy: 1 },
	{ name: 'W', dx: -2, dy: 0 },
	{ name: 'NW', dx: -1, dy: -1 },
];

/** Screen-space offset of one step in each direction (for a given tile width). */
export function directionScreenDelta(index, tileW) {
	const d = DIRECTIONS[index];
	return { dx: d.dx * (tileW / 2), dy: d.dy * (tileW / 4) };
}

/** Screen position of the centre of tile (x, y) at the given tile width. */
export function tileToWorld(x, y, tileW) {
	return { x: x * (tileW / 2), y: y * (tileW / 4) };
}

/** Inverse of `tileToWorld`; returns fractional tile coordinates. */
export function worldToTile(wx, wy, tileW) {
	return { x: (2 * wx) / tileW, y: (4 * wy) / tileW };
}

/** Diamond half-extents for a tile of the given width. */
export function tileExtents(tileW) {
	return { hw: tileW / 2, hh: tileW / 4 };
}

/** Diamond corner points for tile (x,y) at world scale. */
export function tileDiamond(x, y, tileW) {
	const { x: cx, y: cy } = tileToWorld(x, y, tileW);
	const { hw, hh } = tileExtents(tileW);
	return {
		cx, cy,
		top: { x: cx, y: cy - hh },
		right: { x: cx + hw, y: cy },
		bottom: { x: cx, y: cy + hh },
		left: { x: cx - hw, y: cy },
	};
}

/** Trace a diamond path centred on (cx, cy). */
export function pathDiamond(ctx, cx, cy, tileW, inset = 0) {
	const hw = tileW / 2 - inset;
	const hh = tileW / 4 - inset / 2;
	ctx.beginPath();
	ctx.moveTo(cx, cy - hh);
	ctx.lineTo(cx + hw, cy);
	ctx.lineTo(cx, cy + hh);
	ctx.lineTo(cx - hw, cy);
	ctx.closePath();
}
