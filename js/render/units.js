/**
 * Unit markers. Multiple units on a tile are grouped into one marker with a
 * count badge; the tooltip lists the stack.
 */

import { tileToWorld } from './iso.js';
import { contrastingOutline, playerColor } from '../rules.js';

function ownerColor(world, owner) {
	const player = world.players.find((p) => p.id === owner);
	return playerColor(player ? player.primaryColor : owner);
}

export function stackUnits(world) {
	const stacks = new Map();
	for (const unit of world.units) {
		if (unit.x < 0 || unit.y < 0) continue;
		const key = unit.y * world.width + unit.x;
		let stack = stacks.get(key);
		if (!stack) {
			stack = [];
			stacks.set(key, stack);
		}
		stack.push(unit);
	}
	return stacks;
}

export function drawUnitStacks(ctx, world, stacks, tileW, layers, visibility) {
	const size = tileW * 0.13;
	for (const [key, stack] of stacks) {
		const x = key % world.width;
		const y = (key / world.width) | 0;
		const { x: cx, y: cy } = tileToWorld(x, y, tileW);
		const unit = stack[0];
		const owner = unit.owner;
		const fill = ownerColor(world, owner);
		const outline = contrastingOutline(fill);
		const dim =
			visibility.mode === 'player' && visibility.approved !== false && owner !== visibility.player;
		ctx.globalAlpha = dim ? 0.45 : 1;

		drawUnitShape(ctx, cx, cy, size, unit.type ?? 0, fill, outline);

		if (stack.length > 1) {
			ctx.beginPath();
			ctx.arc(cx + size * 1.3, cy - size * 1.1, size * 0.75, 0, Math.PI * 2);
			ctx.fillStyle = '#1b1b1b';
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.font = `bold ${Math.max(6, Math.round(size))}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(stack.length), cx + size * 1.3, cy - size * 1.1);
		}

		if (layers.unitNames && tileW >= 44) drawUnitLabel(ctx, unit.name, cx, cy - size * 2.4, tileW);
		ctx.globalAlpha = 1;
	}
}

function drawUnitShape(ctx, cx, cy, size, type, fill, outline) {
	ctx.beginPath();
	if (type === 1) {
		// Sea: downward triangle.
		ctx.moveTo(cx - size, cy - size * 0.7);
		ctx.lineTo(cx + size, cy - size * 0.7);
		ctx.lineTo(cx, cy + size);
	} else if (type === 2) {
		// Air: upward triangle.
		ctx.moveTo(cx, cy - size);
		ctx.lineTo(cx + size, cy + size * 0.7);
		ctx.lineTo(cx - size, cy + size * 0.7);
	} else {
		// Land: square.
		ctx.rect(cx - size, cy - size, size * 2, size * 2);
	}
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.lineWidth = Math.max(1, size * 0.25);
	ctx.strokeStyle = outline;
	ctx.stroke();
}

function drawUnitLabel(ctx, text, x, y, tileW) {
	const size = Math.max(7, Math.round(tileW * 0.2));
	ctx.font = `${size}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const width = ctx.measureText(text).width + size * 0.6;
	ctx.fillStyle = 'rgba(27,27,27,0.78)';
	ctx.fillRect(x - width / 2, y - size * 0.7, width, size * 1.4);
	ctx.fillStyle = '#ffffff';
	ctx.fillText(text, x, y + 0.5);
}
