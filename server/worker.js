import fs from 'fs';
import pkg from 'mongoose';
import { parentPort, workerData } from 'worker_threads';
import utils from './utils.js';
const { Types } = pkg;

async function process() {
	const {
		_id,
		inputVideoUrl,
		videoName,
		videoDownloadPath,
		settings: { trims, trimMode, crop, modified, rotateValue },
	} = workerData;

	const videoId = _id;
	const downloadingVideoInfo = {
		videoName,
		videoId
	};

	try {
		let error = false;
		let videoPath = videoDownloadPath;

		if (videoDownloadPath === null) {
			const urlDownload = await utils.downloadVideo(inputVideoUrl, downloadingVideoInfo);
			videoPath = urlDownload.videoPath;
			error = urlDownload.error;
		}
		if (error || !videoPath || !fs.existsSync(videoPath)) {
			return 'Error downloading video';
		}

		// Combine audio disable, rotation and cropping in one command if set
		const manipulations = {};
		if (modified.mute === true) {
			manipulations.disable_audio = true;
		}

		if (modified.rotate === true) {
			manipulations.rotate = rotateValue;
		}

		if (modified.crop === true) {
			manipulations.crop = crop;
		}

		let newVideoPath = null;
		const hasManipulations = Object.keys(manipulations).length > 0;
		// Manipulate video if audio disable, rotation or cropping is set and trim is not set
		if (hasManipulations && modified.trim !== true) {
			const manipulationsVideoInfo = {
				videoPath,
				videoId
			};

			const manipulateStage = await utils.manipulateVideo(manipulationsVideoInfo, manipulations);
			newVideoPath = manipulateStage.newVideoPath;
		}

		// Trim video is set
		if (modified.trim === true) {
			manipulations.trim = true;

			newVideoPath = newVideoPath || videoPath;
			const trimmingVideoInfo = {
				videoPath: newVideoPath,
				videoId
			};

			const trimStage = await utils.trimVideos(trimmingVideoInfo, trims, manipulations);
			newVideoPath = trimStage.trimsLocations;

			// Concatenate videos if mode is single
			if (trimMode === 'single' && trims.length > 1) {
				const concatenatingVideoInfo = {
					videoPaths: newVideoPath,
					videoId
				};
				const concatStage = await utils.concatVideos(concatenatingVideoInfo);
				newVideoPath = concatStage.concatenatedLocation;
			}
		}

		// Convert video and return the converted video path
		const convertingVideoInfo = {
			videoPaths: newVideoPath,
			videoId
		};

		const convertFormat = await utils.convertVideoFormat(convertingVideoInfo);

		// Delete downloaded video
		utils.deleteFiles(videoPath);

		return { videoId, convertFormat };
	} catch (manipulationError) {
		parentPort.postMessage({
			type: 'server-side-and-frontend-update',
			videoId,
			data: {
				videoId,
				status: 'error',
				error: manipulationError
			}
		});
		console.log('ERROR', manipulationError);
		return manipulationError;
	}
}

process().then(async videos => {
	// Move videos to public folder
	const videosWithNewPaths = await utils.moveVideosToPublic(videos.convertFormat);

	parentPort.postMessage({
		type: 'server-side-and-frontend-update',
		videoId: videos.videoId,
		data: {
			videoId: videos.videoId,
			status: 'done',
			videos: videosWithNewPaths
		}
	});
});
