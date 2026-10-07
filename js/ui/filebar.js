/**
 * File bar: drag-and-drop anywhere, file picker, and the load report.
 */

export function setupFileBar({ onFile, getReport }) {
	const dropHint = document.getElementById('drop-hint');
	const fileInput = document.getElementById('file-input');
	const pickButton = document.getElementById('pick-file');
	const report = document.getElementById('load-report');
	const privacy = document.getElementById('privacy-note');

	const openPicker = () => fileInput.click();
	pickButton?.addEventListener('click', openPicker);
	dropHint?.addEventListener('click', openPicker);

	fileInput?.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (file) onFile(file);
		fileInput.value = '';
	});

	// Drag anywhere in the window.
	let dragDepth = 0;
	window.addEventListener('dragenter', (e) => {
		e.preventDefault();
		dragDepth++;
		document.body.classList.add('dragging');
		dropHint?.classList.add('visible');
	});
	window.addEventListener('dragover', (e) => e.preventDefault());
	window.addEventListener('dragleave', (e) => {
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) {
			document.body.classList.remove('dragging');
			dropHint?.classList.remove('visible');
		}
	});
	window.addEventListener('drop', (e) => {
		e.preventDefault();
		dragDepth = 0;
		document.body.classList.remove('dragging');
		dropHint?.classList.remove('visible');
		const files = [...(e.dataTransfer?.files ?? [])];
		if (files.length) onFile(files[0]);
	});

	if (privacy) {
		privacy.textContent = 'Files are parsed entirely in your browser and never uploaded.';
	}

	return {
		showStatus(text) {
			if (report) report.innerHTML = `<p class="status">${escapeHtml(text)}</p>`;
		},
		showError(message) {
			if (report) report.innerHTML = `<p class="status error">${escapeHtml(message)}</p>`;
		},
		renderReport() {
			if (!report) return;
			const r = getReport();
			if (!r) {
				report.innerHTML = '<p class="muted">Load a Civ3 .sav / .biq / .bic or an OpenCiv3 .json save to begin.</p>';
				return;
			}
			const rows = r.rows
				.map(([k, v]) => `<div class="kv"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`)
				.join('');
			const warnings = r.warnings?.length
				? `<details class="warnings"><summary>${r.warnings.length} warning(s)</summary><ul>${r.warnings
						.map((w) => `<li>${escapeHtml(w)}</li>`)
						.join('')}</ul></details>`
				: '';
			report.innerHTML = `<h3>${escapeHtml(r.title)}</h3><dl>${rows}</dl>${warnings}`;
		},
	};
}

function escapeHtml(text) {
	return text.replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}
