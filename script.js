const { ipcRenderer } = require('electron');
const selectBtn = document.getElementById('selectFiles');
const fileListEl = document.getElementById('fileList');
const videoEl = document.getElementById('video');
const metadataEl = document.getElementById('metadata');
const progressBar = document.getElementById('progressBar');
const batchStatusEl = document.getElementById('batchStatus');

let currentFiles = {};
let currentBlobUrl = null;
let currentBatch = { total: 0, loaded: 0 }

ipcRenderer.removeAllListeners('file-loaded');
ipcRenderer.on('file-loaded', (event, { fileName, fileIndex, totalFiles }) => {
	currentBatch.loaded++;
	currentBatch.total = totalFiles;
	batchStatusEl.textContent = `${currentBatch.loaded}/${currentBatch.total} files cached`;

	//add file to file list
	if (!document.getElementById(`file-${fileName}`)) {
		const li = document.createElement('li');
		li.id = `file-${fileName}`;
		li.textContent = fileName;
		li.style.cursor = 'pointer';
		li.addEventListener('click', () => playFile(currentFiles[fileName]));
		fileListEl.appendChild(li);
	}

	//hide upload status after done
	if (currentBatch.loaded === currentBatch.total) {
		setTimeout(() => {
			batchStatusEl.style.display = 'none';
		}, 0); //100-500 before
	}
});

selectBtn.addEventListener('click', async () => {
	batchStatusEl.style.display = 'block';
	batchStatusEl.textContent = '0/0 files cached';

	const newFiles = await ipcRenderer.invoke('open-files');
	if (!newFiles.length) {
		batchStatusEl.style.display = 'none';
		return;
	};

	newFiles.forEach(file => {
		if (!currentFiles[file.name]) {
			currentFiles[file.name] = file;
		}
	});

	currentBatch = { total: newFiles.length, loaded: 0 };
	batchStatusEl.textContent = `0/${currentBatch.total} files cached`;
});

async function playFile(file) {
	try {
		const arrayBuffer = await ipcRenderer.invoke('get-file-buffer', file.name);

		if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl); // Revoke previous blob URL

		const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
		currentBlobUrl = URL.createObjectURL(blob);

		videoEl.src = currentBlobUrl;
		videoEl.load();
		videoEl.play();

		const meta = await ipcRenderer.invoke('get-metadata', file.name);
		metadataEl.textContent = JSON.stringify(meta, null, 2);

	} catch (err) {
		metadataEl.textContent = `Error loading video: ${err.message}`;
	}		
}

ipcRenderer.on('file-load-progress', (event, { fileName, progress }) => {
	progressBar.value = Math.round(progress * 100); // 0–100%
});