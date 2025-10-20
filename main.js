import electron from 'electron';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

const { app, BrowserWindow } = electron; // <-- FIX

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const videoFile = path.join(process.cwd(), 'sample.mp4');

function createWindow() {
	const win = new BrowserWindow({
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

	// Get video metadata
	ffmpeg(videoFile).ffprobe((err, data) => {
		if (err) console.error('FFprobe Error:', err);
		else console.log('Media info:', data.format);

		// Send metadata to renderer
		win.webContents.once('did-finish-load', () => {
			win.webContents.send('video-metadata', data.format);
		});
	});
}
app.setUserTasks([]);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
