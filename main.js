const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
const { PassThrough } = require('stream');
//const { buffer } = require('stream/consumers'); not needed for now

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

let win;
const fileCache = {};
app.commandLine.appendSwitch('enable-logging', 'false'); //disable for useless info

//const videoFile = path.join(process.cwd(), 'sample.mp4'); //legacy
protocol.registerSchemesAsPrivileged([
	{ scheme: 'mem', privileges: { standard: true, secure: true, stream: true } }
]);

function createWindow() {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		//titleBarStyle: 'hidden',  //both hide top os bar
		//frame: false, //both hide top os bar
		autoHideMenuBar: true, //hides file, edit, view...
		icon: path.join(process.cwd(), 'app-icon.png'), //app icon
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		},
	});

	win.loadFile('index.html');
}

const mimeMap = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
};

app.whenReady().then(() => {
	createWindow();
});

ipcMain.handle('open-files', async (event) => {
	const result = await dialog.showOpenDialog(win, {
		title: 'Select files',
		properties: ['openFile', 'multiSelections'],
		filters: [
			{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
			{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic'] },
			{ name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'] }
		]
	});

	if (result.canceled || result.filePaths.length === 0) return [];

	const files = [];
	const totalFiles = result.filePaths.length;

	for (let i = 0; i < totalFiles; i++){
		const filePath = result.filePaths[i];
		const fileName = path.basename(filePath);
		await loadFileToCache(filePath, (fileName, progress) => {
			event.sender.send('file-load-progress', { fileName, progress });
		});
		files.push({ name: fileName });

		event.sender.send('file-loaded', { fileName, fileIndex: i + 1, totalFiles });
	}

	return files;
});

// Return metadata from in-memory buffer using ffmpeg
ipcMain.handle('get-metadata', async (event, fileName) => {
	const buffer = fileCache[fileName];
	if (!buffer) throw new Error('File not cached');

	return new Promise((resolve, reject) => {
		const stream = new PassThrough();
		stream.end(buffer);
		ffmpeg(stream).ffprobe((err, data) => {
			if (err) reject(err);
			else resolve(data.format);
		});
	});
});

ipcMain.handle('get-file-buffer', (event, fileName) => {
	const buffer = fileCache[fileName];
	if (!buffer) throw new Error('File not found in cache');
	return buffer;
});

function loadFileToCache(filePath, onProgress) {
	return new Promise((resolve, reject) => {
		const fileName = path.basename(filePath);
		const stats = fs.statSync(filePath);
		const totalSize = stats.size;

		let loaded = 0;
		const chunks = [];

		const stream = fs.createReadStream(filePath);

		stream.on('data', (chunk) => {
			chunks.push(chunk);
			loaded += chunk.length;
			if (onProgress) onProgress(fileName, loaded / totalSize); // 0–1
		});

		stream.on('end', () => {
			const buffer = Buffer.concat(chunks);
			fileCache[fileName] = buffer;
			resolve({ fileName, buffer });
		});

		stream.on('error', (err) => reject(err));
	});
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
