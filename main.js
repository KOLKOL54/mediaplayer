/*import electron from 'electron';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

const { app, BrowserWindow, ipcMain, dialog, protocol } = electron; // <-- FIX*/

const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
const { PassThrough } = require('stream');
const { buffer } = require('stream/consumers');

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
	
	protocol.registerStreamProtocol('mem', (request, callback) => {
		try {
			const url = new URL(request.url);
			const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

			const buffer = fileCache[fileName];

			console.log('[mem:// request]', { fileName, hasBuffer: !!buffer });

			if (!buffer) {
				callback({ statusCode: 404 });
				return;
			}

			const ext = (fileName.split('.').pop() || '').toLowerCase();
			const mime = mimeMap[ext] || 'application/octet-stream';
			const total = buffer.length;
			const rangeHeader = request.headers && (request.headers.range || request.headers.Range);

			if (rangeHeader) {
				const matches = /bytes=(\d*)/.exec(rangeHeader);
				let start = matches && matches[1] ? parseInt(matches[1], 10) : 0;
				let end = matches && matches[2] ? parseInt(matches[2], 10) : total - 1;

				if (isNaN(start)) start = 0;
				if (isNaN(end) || end >= total) end = total - 1;
				if (start > end) start = end;

				const chunk = buffer.slice(start, end + 1);
				const stream = new PassThrough();
				stream.end(chunk);

				const headers = {
					'Content-Type': mime,
					'Content-Length': chunk.length,
					'Accept-Ranges': 'bytes',
					'Content-Range': `bytes ${start}-${end}/${total}`,
				};

				callback({
					statusCode: 206,
					headers,
					data:  stream
				}); 
			} else {
				const stream = new PassThrough();
				stream.end(buffer);

				const headers = {
					'Content-Type': mime,
					'Content-Length': total,
					'Accept-Ranges': 'bytes',				
				};

				callback({
					statusCode: 200,
					headers,
					data: stream
				});
			}
			
		} catch (err) {
			console.error('mem protocol error', err);
			callback({ statusCode: 500 });
		}
	});
});

ipcMain.handle('open-files', async () => {
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

	for (const filePath of result.filePaths) {
		const fileName = path.basename(filePath);
		//fileCache[fileName] = buffer; //maybe trash

		try {
			const buffer = fs.readFileSync(filePath);

			// Store in RAM cache using the exact fileName
			fileCache[fileName] = buffer;

			// Add file info for renderer
			files.push({
				name: fileName, // exact key for cache and metadata requests
				url: `mem://memhost/${encodeURIComponent(fileName)}`
			});
		} catch (err) {
			console.error(`Failed to read file ${filePath}:`, err);
		}
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

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
