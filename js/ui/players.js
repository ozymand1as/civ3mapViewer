/**
 * Visibility ("whose view") selector: god view, one player, all-explored, or a
 * 2-3 player comparison tint.
 */

import { saveVisibility } from '../state.js';
import { playerColor } from '../rules.js';

export function setupPlayers(state, onChange) {
	const container = document.getElementById('players-panel');
	if (!container) return { render() {} };

	container.innerHTML = `
		<div class="field">
			<label for="vis-mode">Visibility</label>
			<select id="vis-mode">
				<option value="god">God view (all)</option>
				<option value="player">Single player</option>
				<option value="allExplored">All explored</option>
				<option value="compare">Compare players</option>
			</select>
		</div>
		<div class="field" id="vis-player-field">
			<label for="vis-player">Player</label>
			<select id="vis-player"></select>
		</div>
		<div class="field" id="vis-compare-field">
			<label>Compare players</label>
			<div id="vis-compare" class="compare-list"></div>
		</div>
		<div class="field" id="fog-dim-field">
			<label for="fog-dim">Explored dimming <span id="fog-dim-value"></span></label>
			<input type="range" id="fog-dim" min="0.05" max="1" step="0.05" />
		</div>
		<p class="muted small" id="vis-note"></p>
	`;

	const modeSelect = container.querySelector('#vis-mode');
	const playerSelect = container.querySelector('#vis-player');
	const compareDiv = container.querySelector('#vis-compare');
	const fogDim = container.querySelector('#fog-dim');
	const fogDimValue = container.querySelector('#fog-dim-value');
	const visNote = container.querySelector('#vis-note');

	modeSelect.value = state.visibility.mode;
	fogDim.value = String(state.visibility.fogDim);

	modeSelect.addEventListener('change', () => {
		state.visibility.mode = modeSelect.value;
		saveVisibility(state.visibility);
		updateVisibility();
		onChange();
	});
	playerSelect.addEventListener('change', () => {
		state.visibility.player = Number(playerSelect.value);
		saveVisibility(state.visibility);
		onChange();
	});
	fogDim.addEventListener('input', () => {
		state.visibility.fogDim = Number(fogDim.value);
		fogDimValue.textContent = `${Math.round(state.visibility.fogDim * 100)}%`;
		saveVisibility(state.visibility);
		onChange();
	});

	function updateVisibility() {
		const mode = state.visibility.mode;
		container.querySelector('#vis-player-field').style.display = mode === 'player' ? '' : 'none';
		container.querySelector('#vis-compare-field').style.display = mode === 'compare' ? '' : 'none';
		container.querySelector('#fog-dim-field').style.display = mode === 'player' ? '' : 'none';
	}

	return {
		render() {
			const world = state.world;
			playerSelect.innerHTML = '';
			compareDiv.innerHTML = '';
			if (world) {
				for (const player of world.players) {
					const option = document.createElement('option');
					option.value = String(player.id);
					option.textContent = `P${player.id}: ${player.civName}${player.barbarian ? ' (barbarians)' : ''}`;
					if (player.id === state.visibility.player) option.selected = true;
					playerSelect.appendChild(option);

					const row = document.createElement('label');
					row.className = 'checkbox';
					const input = document.createElement('input');
					input.type = 'checkbox';
					input.value = String(player.id);
					input.checked = state.visibility.compare.includes(player.id);
					const swatch = document.createElement('span');
					swatch.className = 'swatch';
					swatch.style.background = playerColor(player.primaryColor);
					const span = document.createElement('span');
					span.textContent = `P${player.id}: ${player.civName}`;
					input.addEventListener('change', () => {
						const compare = new Set(state.visibility.compare);
						if (input.checked) compare.add(player.id);
						else compare.delete(player.id);
						state.visibility.compare = [...compare];
						saveVisibility(state.visibility);
						onChange();
					});
					row.append(input, swatch, span);
					compareDiv.appendChild(row);
				}
				if (!world.players.some((p) => p.id === state.visibility.player)) {
					state.visibility.player = world.players[0]?.id ?? 0;
				}
			}
			visNote.textContent = world?.visibilityApproximated
				? 'OpenCiv3 saves only persist explored tiles, so "visible now" is approximated by exploration.'
				: '';
			modeSelect.value = state.visibility.mode;
			fogDim.value = String(state.visibility.fogDim);
			fogDimValue.textContent = `${Math.round(state.visibility.fogDim * 100)}%`;
			updateVisibility();
		},
	};
}
