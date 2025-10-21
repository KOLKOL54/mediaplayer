const { ipcRenderer } = require('electron');
const selectBtn = document.getElementById('selectFiles');
const fileListEl = document.getElementById('fileList');
const videoEl = document.getElementById('video');
const metadataEl = document.getElementById('metadata');
const progressBar = document.getElementById('progressBar');
const batchStatusEl = document.getElementById('batchStatus');
const galleryEl = document.getElementById('gallery');
const inner = document.getElementById('gallery-inner');

let currentFiles = {};
let currentBlobUrl = null;
let currentBatch = { total: 0, loaded: 0 }

ipcRenderer.removeAllListeners('file-loaded');
ipcRenderer.on('file-loaded', (event, { fileName, fileIndex, totalFiles }) => {
	currentBatch.loaded++;
	currentBatch.total = totalFiles;
	batchStatusEl.textContent = `${currentBatch.loaded}/${currentBatch.total} files cached`;

	if (!document.getElementById(`card-${fileName}`)) {
		const card = document.createElement('div');
		card.className = "file-card";
		card.id = `card-${fileName}`;
		card.style.position = 'relative';

		// create container for square crop
		const imgContainer = document.createElement('div');
		imgContainer.style.width = '90%';        // fill the card width
		imgContainer.style.height = '80%';       // desired height
		imgContainer.style.position = 'absolute';
		imgContainer.style.top = '5%';
		imgContainer.style.overflow = 'hidden';  // crop overflow
		imgContainer.style.borderRadius = '8px';

		//add image
		const img = document.createElement('img');
		//img.src = 'app-icon.png'; replaced
		img.alt = fileName;
		img.style.height = '100%';
		img.style.width = '100%';
		/*img.style.position = 'absolute';
		img.style.top = '5%';
		img.style.borderRadius = '8px';*/
		img.style.objectFit = 'cover';           // crops to fit the square
		img.style.objectPosition = 'center';

		// fetch video thumbnail from main process
		ipcRenderer.invoke('get-video-thumbnail', fileName)
			.then((base64Thumbnail) => {
				img.src = base64Thumbnail; // set thumbnail
		})
		.catch((err) => {
			console.error('Error generating thumbnail for', fileName, err);
			img.src = 'app-icon.png'; // fallback to default icon
		});

		//show filename
		const caption = document.createElement('div');
		caption.textContent = fileName;
		caption.style.textAlign = 'center';
		caption.style.marginTop = '4px';
		caption.style.position = 'absolute';
		caption.style.bottom = '3%';
		caption.style.fontSize = '60%';

		imgContainer.appendChild(img)
		card.appendChild(imgContainer);
		card.appendChild(caption);

		card.addEventListener('click', () => playFile(currentFiles[fileName]));
		//galleryEl.appendChild(card);
		inner.appendChild(card);
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
		//batchStatusEl.style.display = 'none'; no vanishing status 3/10
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