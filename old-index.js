import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const input = "sample.mp4"; // Put a test file in this folder

ffmpeg(input)
	ffprobe((err, data) => {
		if (err) console.error("Error:", err);
		else console.log("Media info:", data.format);
	});
