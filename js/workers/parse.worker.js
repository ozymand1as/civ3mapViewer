/**
 * Parse worker: decompresses and parses Civ3/OpenCiv3 files off the main
 * thread, then posts the unified model back via structured clone.
 */

import { importFile } from '../importer/index.js';

self.onmessage = (event) => {
	const { id, buffer, name } = event.data ?? {};
	if (!id) return;

	const post = (type, payload) => self.postMessage({ id, type, ...payload });

	try {
		post('progress', { stage: 'start', detail: name });
		const bytes = new Uint8Array(buffer);
		const world = importFile(bytes, name, (stage, detail) => {
			post('progress', { stage, detail });
		});
		post('done', { world });
	} catch (err) {
		post('error', { message: err?.message ?? String(err), stack: err?.stack ?? '' });
	}
};
