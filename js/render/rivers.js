/**
 * River edges.
 *
 * Civ3 stores rivers as an 8-bit mask per tile. Only the four *diagonal* bits
 * carry geometry: each one is a full tile edge, i.e. the segment joining two
 * adjacent corners of the diamond.
 *
 *   bit 1 = NE  -> edge from the top corner to the right corner
 *   bit 3 = SE  -> edge from the right corner to the bottom corner
 *   bit 5 = SW  -> edge from the bottom corner to the left corner
 *   bit 7 = NW  -> edge from the left corner to the top corner
 *
 * A river running along an edge is recorded by *both* tiles that share it, as
 * mirrored bits (NE↔SW, SE↔NW), which is why the two halves always line up.
 *
 * The four *cardinal* bits (N, E, S, W) are corner marks, not edges: they mean
 * the river passes through that corner of the tile. Because tile centres and
 * tile corners are distinct lattice points, a corner is normally where two
 * edges owned by the other tiles around it meet — so a cardinal-only tile is
 * simply a tile the river clips at one corner and contributes no line itself.
 * This is exactly the model c3sat's vector map and OpenCiv3's `RiverLayer` use
 * (both draw only the four edges).
 *
 * Edges are drawn per tile rather than deduplicated: the two tiles sharing an
 * edge emit the identical segment, so drawing from whichever of them is
 * visible keeps rivers correct under per-tile visibility and fog.
 */

import { tileToWorld, tileExtents } from './iso.js';

/** Diagonal river bits and the diamond corners their edge joins. */
const EDGES = [
	{ bit: 1, from: 'top', to: 'right' }, // NE
	{ bit: 3, from: 'right', to: 'bottom' }, // SE
	{ bit: 5, from: 'bottom', to: 'left' }, // SW
	{ bit: 7, from: 'left', to: 'top' }, // NW
];

/** Any diagonal bit set? (`0xaa` = bits 1, 3, 5, 7.) */
const HAS_EDGE = 0xaa;

export function drawRivers(ctx, tile, tileW) {
	const mask = tile.riverEdges;
	if (!mask || !(mask & HAS_EDGE)) return;

	const { x: cx, y: cy } = tileToWorld(tile.x, tile.y, tileW);
	const { hw, hh } = tileExtents(tileW);
	const corners = {
		top: [cx, cy - hh],
		right: [cx + hw, cy],
		bottom: [cx, cy + hh],
		left: [cx - hw, cy],
	};

	ctx.strokeStyle = '#2f74d0';
	ctx.lineWidth = Math.max(1, tileW * 0.055);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	for (const edge of EDGES) {
		if (!(mask & (1 << edge.bit))) continue;
		const a = corners[edge.from];
		const b = corners[edge.to];
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}
}
