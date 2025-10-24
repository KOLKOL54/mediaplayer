const { ipcRenderer } = require('electron');
const selectBtn = document.getElementById('selectFiles');
const fileListEl = document.getElementById('fileList');
const videoEl = document.getElementById('video');
const metadataEl = document.getElementById('metadata');
const progressBar = document.getElementById('progressBar');
const batchStatusEl = document.getElementById('batchStatus');
const galleryEl = document.getElementById('gallery');
const inner = document.getElementById('gallery-inner');
const imageEl = document.getElementById('image');
const gallery = document.getElementById('gallery');
const container = document.getElementById('container');
const divider = document.getElementById('divider');

let currentMediaEl = null;
window.addEventListener('resize', () => {
	if (currentMediaEl) fitMedia(currentMediaEl);
});

let isDragging = false;

divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.style.userSelect = 'none'; //prevent text selection when dragging
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  document.body.style.userSelect = '';
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  //Calculate new gallery width
  const containerRect = container.getBoundingClientRect();
  let newGalleryWidth = e.clientX - containerRect.left;

  // Optional limits
  const minWidth = 200;
  const maxWidth = containerRect.width * 0.7; // 70% max
  if (newGalleryWidth < minWidth) newGalleryWidth = minWidth;
  if (newGalleryWidth > maxWidth) newGalleryWidth = maxWidth;

  gallery.style.width = newGalleryWidth + 'px';
});

if (gallery) {
	const resizeObserver = new ResizeObserver(() => {
		if (currentMediaEl) fitMedia(currentMediaEl);
	});
	resizeObserver.observe(gallery);
}

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

		//create container for square crop
		const imgContainer = document.createElement('div');
		imgContainer.style.width = '90%'; //fill the card width
		imgContainer.style.height = '80%'; //desired height
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
		img.style.objectFit = 'cover'; //crops to fit the square
		img.style.objectPosition = 'center';

		// fetch video thumbnail from main process
		ipcRenderer.invoke('get-media-thumbnail', fileName)
			.then((base64Thumbnail) => {
				img.src = base64Thumbnail; //set thumbnail
		})
		.catch((err) => {
			console.error('Error generating thumbnail for', fileName, err);
			img.src = 'app-icon.png'; //default icon if nothing get-media-thumbnail no work
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
		// Stop currently playing video
        videoEl.pause();

		const ext = file.name.split('.').pop().toLowerCase();
		const arrayBuffer = await ipcRenderer.invoke('get-file-buffer', file.name);

		if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl); //Revoke previous blob URL

		let mimeType = 'application/octet-stream';
		if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) mimeType = 'video/mp4';
		else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(ext)) mimeType = 'audio/mpeg';
		else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic'].includes(ext)) mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

		const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
		currentBlobUrl = URL.createObjectURL(blob);

		videoEl.style.display = 'none';
		imageEl.style.display = 'none';

		let usedEl;
		if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
			usedEl = videoEl;
			videoEl.src = currentBlobUrl;
			await new Promise((resolve) => {
				videoEl.onloadedmetadata = resolve;
			});
			videoEl.load();
			videoEl.play();
		} else if (mimeType.startsWith('image/')) {
			usedEl = imageEl;
			imageEl.src = currentBlobUrl;
			await new Promise((resolve) => {
				imageEl.onload = resolve;
			});
		} else {
			metadataEl.textContent = `Unsupported file type: ${ext}`;
			return;
		}
		usedEl.style.display = 'block';
		fitMedia(usedEl);
		currentMediaEl = usedEl;		

		try {
			const meta = await ipcRenderer.invoke('get-metadata', file.name);
			metadataEl.textContent = JSON.stringify(meta, null, 2);
		} catch (metaErr) {
			metadataEl.textContent = `No metadata available for ${file.name}`;
		}
	} catch (err) {
		metadataEl.textContent = `Error loading video: ${err.message}`;
	}		
}

function fitMedia(el) {
	
	const container = document.getElementById('video-holder');
	const containerWidth = container.clientWidth;
	const containerHeight = container.clientHeight;

	//Media intrinsic dimensions
	const mediaWidth = el.videoWidth || el.naturalWidth;
	const mediaHeight = el.videoHeight || el.naturalHeight;

	if (!mediaWidth || !mediaHeight) return; //wait until loaded

	const containerRatio = containerWidth / containerHeight;
	const mediaRatio = mediaWidth / mediaHeight;

	let width, height;

	if (mediaRatio > containerRatio) {
		//Media is wider relative to container → limit width
		width = containerWidth;
		height = width / mediaRatio;
	} else {
		//Media is taller relative to container → limit height
		height = containerHeight;
		width = height * mediaRatio;
	}

	el.style.width = `${width}px`;
	el.style.height = `${height}px`;
}


ipcRenderer.on('file-load-progress', (event, { fileName, progress }) => {
	progressBar.value = Math.round(progress * 100); // 0–100%
});