const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const os = require('os');
//const { buffer } = require('stream/consumers'); not needed for now
let ffmpegExec = require('ffmpeg-static');
let ffprobeExec = require('ffprobe-static').path;

if (app.isPackaged) {
	const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
	ffmpegExec = path.join(unpackedPath, 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
	ffprobeExec = path.join(unpackedPath, 'ffprobe-static', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
}

ffmpeg.setFfmpegPath(ffmpegExec);
ffmpeg.setFfprobePath(ffprobeExec);

const gotTheLock = app.requestSingleInstanceLock();
let win;

if (!gotTheLock) {
	app.quit(); //end if other instance already exists
} else {
	app.on('second-instance', () => {
		if (win) {
			if (win.isMinimized()) win.restore();
			win.focus();
		}
	});
}

autoUpdater.logger = log;
autoUpdater.autoDownload = true;

const fileCache = {};
app.commandLine.appendSwitch('enable-logging', 'false'); //disable for useless info
let isLoadingFiles = false;

//const videoFile = path.join(process.cwd(), 'sample.mp4'); //legacy
protocol.registerSchemesAsPrivileged([
	{ scheme: 'mem', privileges: { standard: true, secure: true, stream: true } }
]);

function createWindow() {
	if (win) return; //stop multiple windows

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
	win.webContents.once('did-finish-load', () => {
		autoUpdater.checkForUpdatesAndNotify();
	})
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
	log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'updater.log');

	if (app.isPackaged) {
		// Only check updates when app is packaged
		autoUpdater.checkForUpdates();

		autoUpdater.on('update-available', (info) => {
			dialog.showMessageBox({
				type: 'info',
				title: 'Update Available',
				message: `Update ${info.version} is downloading...`,
				buttons: ['OK']
			});
		});

		autoUpdater.on('update-downloaded', () => {
			log.info('Update downloaded - installing now...');
			autoUpdater.quitAndInstall();
		});

		autoUpdater.on('update-not-available', () => {
			log.info('No update available. Starting...');
			createWindow();
		});

		autoUpdater.on('error', (err) => {
			log.error('Update error:', err);
			createWindow();
		});
	} else {
		// Dev mode: just open window
		createWindow();
	}
});


ipcMain.handle('open-files', async (event) => {
	if (isLoadingFiles) {
		await dialog.showMessageBox(win, {
			type: 'warning',
			title: 'Already loading files',
			message: 'Loading in progress. Wait for it to finnish',
			buttons: ['OK']
		});
		return [];
	}

	isLoadingFiles = true; //stop user actions
	try {
		const result = await dialog.showOpenDialog(win, {
			title: 'Select files',
			properties: ['openFile', 'multiSelections'],
			filters: [
				{ name: 'Media', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma']},
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
	} finally {
		isLoadingFiles = false; //allow new file loads
	}
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

ipcMain.handle('get-media-thumbnail', async (event, fileName) => {
	const buffer = fileCache[fileName];
	if (!buffer) throw new Error('File not cached');

	const ext = path.extname(fileName).toLowerCase().slice(1);

	if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic'].includes(ext)) {
		const base64 = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
		return base64;
	}

	const tempPath = path.join(os.tmpdir(), `${fileName}.mp4`);
	fs.writeFileSync(tempPath, buffer);

	return new Promise((resolve, reject) => {
		const chunks = [];

		ffmpeg(tempPath)
			.setFfmpegPath(ffmpegExec)
			.seekInput('00:00:01')
			.frames(1) // only 1 frame
			.format('mjpeg') // some generic formap maybe jpeg
			.on('error', (err) => reject(err))
			.on('end', () => {
				const thumbnailBuffer = Buffer.concat(chunks);
				// Convert to base64 string so renderer can use as src
				const base64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
				fs.unlink(tempPath, () => {}); //delete temp file
				resolve(base64);
			})
			.pipe(new PassThrough())
			.on('data', (chunk) => chunks.push(chunk));
		});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
