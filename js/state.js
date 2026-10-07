/**
 * Application state: the parsed model, view transform, layer toggles and the
 * visibility selector. Layer/visibility choices are persisted to localStorage.
 */

const LAYERS_KEY = 'civ3viewer.layers';
const UI_KEY = 'civ3viewer.ui';

export const DEFAULT_LAYERS = {
	terrain: true,
	grid: false,
	coordinates: false,
	rivers: true,
	roads: true,
	railroads: true,
	mine: false,
	irrigation: false,
	fortress: false,
	barricade: false,
	airfield: false,
	radarTower: false,
	outpost: false,
	resources: true,
	cities: true,
	cityNames: true,
	cityStatuses: true,
	units: true,
	unitNames: false,
	startingLocations: true,
	goodyHut: true,
	barbarianCamp: true,
	pollution: true,
	continents: false,
	fog: true,
};

export const LAYER_GROUPS = [
	{
		title: 'Terrain',
		layers: [
			['terrain', 'Terrain'],
			['grid', 'Tile grid'],
			['coordinates', 'Coordinates'],
			['continents', 'Continent tint'],
			['rivers', 'Rivers'],
		],
	},
	{
		title: 'Improvements',
		layers: [
			['roads', 'Roads'],
			['railroads', 'Railroads'],
			['mine', 'Mines'],
			['irrigation', 'Irrigation'],
			['fortress', 'Fortresses'],
			['barricade', 'Barricades'],
			['airfield', 'Airfields'],
			['radarTower', 'Radar towers'],
			['outpost', 'Outposts'],
		],
	},
	{
		title: 'Resources & features',
		layers: [
			['resources', 'Resources'],
			['goodyHut', 'Goody huts'],
			['barbarianCamp', 'Barbarian camps'],
			['pollution', 'Pollution / craters / ruins'],
		],
	},
	{
		title: 'Cities & units',
		layers: [
			['cities', 'Cities'],
			['cityNames', 'City names'],
			['cityStatuses', 'City statuses'],
			['units', 'Units'],
			['unitNames', 'Unit names'],
			['startingLocations', 'Starting locations'],
		],
	},
];

export function createState() {
	return {
		world: null,
		status: 'idle',
		fileName: '',
		/** Pan/zoom: `tileW` is the on-screen tile width in CSS pixels. */
		view: { offsetX: 0, offsetY: 0, tileW: 56 },
		layers: loadLayers(),
		visibility: loadVisibility(),
		hover: null,
		pinned: null,
	};
}

export function loadLayers() {
	const layers = { ...DEFAULT_LAYERS };
	try {
		const raw = localStorage.getItem(LAYERS_KEY);
		if (raw) Object.assign(layers, JSON.parse(raw));
	} catch {
		/* ignore malformed storage */
	}
	return layers;
}

export function saveLayers(layers) {
	try {
		localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
	} catch {
		/* storage may be unavailable */
	}
}

export function loadVisibility() {
	const visibility = { mode: 'god', player: 0, compare: [], fogDim: 0.45 };
	try {
		const raw = localStorage.getItem(UI_KEY);
		if (raw) Object.assign(visibility, JSON.parse(raw));
	} catch {
		/* ignore */
	}
	return visibility;
}

export function saveVisibility(visibility) {
	try {
		localStorage.setItem(UI_KEY, JSON.stringify(visibility));
	} catch {
		/* storage may be unavailable */
	}
}
