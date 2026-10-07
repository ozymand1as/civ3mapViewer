/**
 * Layers panel: checkboxes generated from LAYER_GROUPS, persisted to
 * localStorage.
 */

import { LAYER_GROUPS, saveLayers } from '../state.js';

export function setupLayers(state, onChange) {
	const container = document.getElementById('layers-panel');
	if (!container) return { render() {} };

	const inputs = new Map();

	for (const group of LAYER_GROUPS) {
		const section = document.createElement('section');
		section.className = 'layer-group';
		const heading = document.createElement('h4');
		heading.textContent = group.title;
		section.appendChild(heading);

		for (const [key, label] of group.layers) {
			const id = `layer-${key}`;
			const row = document.createElement('label');
			row.className = 'checkbox';
			row.htmlFor = id;
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.id = id;
			input.checked = !!state.layers[key];
			input.addEventListener('change', () => {
				state.layers[key] = input.checked;
				saveLayers(state.layers);
				onChange();
			});
			const span = document.createElement('span');
			span.textContent = label;
			row.append(input, span);
			section.appendChild(row);
			inputs.set(key, input);
		}
		container.appendChild(section);
	}

	return {
		render() {
			for (const [key, input] of inputs) input.checked = !!state.layers[key];
		},
	};
}
