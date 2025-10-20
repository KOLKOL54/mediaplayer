const { ipcRenderer } = require('electron');

const selectBtn = document.getElementById('selectFiles');
const fileListEl = document.getElementById('fileList');
const videoEl = document.getElementById('video');
const metadataEl = document.getElementById('metadata');

let currentFiles = [];
let currentBlobUrl = null;

selectBtn.addEventListener('click', async () => {
	currentFiles = await ipcRenderer.invoke('open-files');

	//update file list
	fileListEl.innerHTML = '';
	currentFiles.forEach(file => {
		const li = document.createElement('li');
		li.textContent = file.name;
		li.style.cursor = 'pointer';
		li.addEventListener('click', () => playFile(file));
		fileListEl.appendChild(li);
	});
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