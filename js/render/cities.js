/**
 * City markers: shape by population size, filled with the owner's colour,
 * outlined for contrast, with optional name and status badges.
 */

import { tileToWorld } from './iso.js';
import { contrastingOutline, playerColor } from '../rules.js';

function ownerColor(world, owner) {
	const player = world.players.find((p) => p.id === owner);
	return playerColor(player ? player.primaryColor : owner);
}

function markerRadius(size, tileW) {
	if (size >= 13) return tileW * 0.2; // metropolis
	if (size >= 7) return tileW * 0.16; // city
	return tileW * 0.12; // town
}

export function drawCities(ctx, world, city, tileW, layers, visibility) {
	const { x: cx, y: cy } = tileToWorld(city.x, city.y, tileW);
	const fill = ownerColor(world, city.owner);
	const outline = contrastingOutline(fill);
	const r = markerRadius(city.size, tileW);

	const dim =
		visibility.mode === 'player' && visibility.approved !== false && city.owner !== visibility.player;
	ctx.globalAlpha = dim ? 0.45 : 1;

	// Marker: a rounded square scaled by size.
	ctx.beginPath();
	const s = r;
	ctx.moveTo(cx, cy - s);
	ctx.lineTo(cx + s, cy);
	ctx.lineTo(cx, cy + s);
	ctx.lineTo(cx - s, cy);
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.lineWidth = Math.max(1, tileW * 0.03);
	ctx.strokeStyle = outline;
	ctx.stroke();

	// Population number in the centre.
	if (tileW >= 30) {
		ctx.fillStyle = outline;
		ctx.font = `bold ${Math.max(7, Math.round(tileW * 0.2))}px system-ui, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(city.size), cx, cy);
	}

	if (layers.cityStatuses) {
		if (city.capital) drawStar(ctx, cx, cy - r * 1.7, r * 0.75, '#ffd700', '#7a5c00');
		if (city.civilDisorder) drawBadge(ctx, cx + r * 1.5, cy - r * 1.4, r * 0.7, '#c0392b', '!');
		else if (city.weLoveTheKingDay) drawBadge(ctx, cx + r * 1.5, cy - r * 1.4, r * 0.7, '#27ae60', '♥');
	}

	if (layers.cityNames && tileW >= 32) {
		drawLabel(ctx, city.name, cx, cy - r * 2.4, tileW, '#ffffff', '#1b1b1b');
	}
	if (layers.cityStatuses && city.producing && tileW >= 44) {
		drawLabel(ctx, city.producing, cx, cy + r * 2.6, tileW * 0.8, '#e8f0ff', '#20304a');
	}
	ctx.globalAlpha = 1;
}

function drawStar(ctx, x, y, r, fill, stroke) {
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const angle = (Math.PI / 5) * i - Math.PI / 2;
		const radius = i % 2 === 0 ? r : r * 0.45;
		const px = x + Math.cos(angle) * radius;
		const py = y + Math.sin(angle) * radius;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.lineWidth = 1;
	ctx.strokeStyle = stroke;
	ctx.stroke();
}

function drawBadge(ctx, x, y, r, fill, text) {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.fillStyle = '#ffffff';
	ctx.font = `bold ${Math.max(6, Math.round(r * 1.5))}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, x, y + 0.5);
}

function drawLabel(ctx, text, x, y, tileW, color, background) {
	const size = Math.max(7, Math.round(tileW * 0.22));
	ctx.font = `${size}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const width = ctx.measureText(text).width + size * 0.6;
	const height = size * 1.35;
	ctx.fillStyle = background;
	ctx.globalAlpha *= 0.78;
	ctx.fillRect(x - width / 2, y - height / 2, width, height);
	ctx.globalAlpha /= 0.78;
	ctx.fillStyle = color;
	ctx.fillText(text, x, y + 0.5);
}
