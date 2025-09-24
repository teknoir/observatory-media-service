const express = require('express');
const { Storage } = require("@google-cloud/storage");
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const { PassThrough } = require('stream');
const { MP4BufferingStream } = require('../../helpers/mp_buffering_stream');
const logger = require('../../helpers/logger');
const { query, validationResult } = require('express-validator');

const router = express.Router();

const isDebug = (process.env.LOG_LEVEL || '').toLowerCase() === 'debug';

router.get(/^\/mp4\/([a-zA-Z:/0-9._-]*.mp4)/, async function (req, res) {
    // Ensure there is a range given for the video (that it is being streamed)
    const range = req.headers.range;
    if (!range) {
        res.status(400).send("Requires Range header");
    }

    // get video metadata and size
    let videoPath = req.params[0];
    try {
        const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            // keyFilename: '/teknoir-admin-credentials.json',
        });
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(videoPath);
        const [metadata] = await remoteFile.getMetadata()
        if (metadata.contentType != 'video/mp4') {
            res.status(400).send("This service only serves content that is video/mp4 for now");
        }
        const videoSize = metadata.size;

        // Parse Range
        // Example: "bytes=32324-"
        const CHUNK_SIZE = 10 ** 6; // 1MB
        const start = Number(range.replace(/\D/g, ""));
        const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

        // Create headers
        const contentLength = end - start + 1;
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4",
        };

        // HTTP Status 206 for Partial Content
        res.writeHead(206, headers);

        // create video read stream for this particular chunk
        const videoStream = remoteFile.createReadStream({ start, end });

        videoStream.on('error', (streamErr) => {
            logger.error('Video stream error:', streamErr);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });

        videoStream.on('end', () => {
            // console.log('Video stream ended');
        });

        req.on('close', () => {
            videoStream.destroy();
        });

        // Stream the video chunk to the client
        videoStream.pipe(res);
    } catch (err) {
        logger.error(err);
        res.status(404).send(`File not found ${err}`);
    }
});

// Validation rules for annotated mp4 endpoint
const annotatedMp4Validation = [
    query('timestamp')
        .exists().withMessage('Missing required query parameter: timestamp')
        .isLength({ max: 50 }).withMessage('Timestamp parameter too long (max 50 characters)')
        .isISO8601().withMessage('Invalid timestamp format. Use ISO 8601 format (e.g., 2025-09-13T00:02:31.629Z)'),
    query('timezone')
        .optional()
        .isLength({ max: 50 }).withMessage('Timezone parameter too long (max 50 characters)')
        .custom((value) => {
            // Validate timezone using luxon
            try {
                const testDate = DateTime.now().setZone(value);
                return testDate.isValid;
            } catch {
                return false;
            }
        }).withMessage('Invalid timezone'),
    query('location')
        .optional()
        .isLength({ max: 50 }).withMessage('Location parameter too long (max 50 characters)')
        .escape(), // Escape HTML entities to prevent XSS
    query('camera')
        .optional()
        .isLength({ max: 50 }).withMessage('Camera parameter too long (max 50 characters)')
        .escape() // Escape HTML entities to prevent XSS
];

router.get(/^\/annotated\/mp4\/([a-zA-Z:/0-9._-]*.mp4)/, annotatedMp4Validation, async function (req, res) {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const videoPath = req.params[0];
    const { timestamp, timezone, location, camera } = req.query;

    logger.info(`Requesting annotated video ${videoPath} at ${timestamp} (${timezone || 'UTC'}, location: ${location}, camera: ${camera})`);

    try {
        const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            // keyFilename: '/teknoir-admin-credentials.json',
        });
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(videoPath);

        // Check if the file exists and get metadata
        const [metadata] = await remoteFile.getMetadata();
        if (metadata.contentType !== 'video/mp4') {
            return res.status(400).send("This service only serves content that is video/mp4 for now");
        }

        // Parse the provided timestamp (already validated by express-validator)
        let startTimestamp = DateTime.fromISO(timestamp, { zone: 'utc' }); // Parse as UTC by default

        // Convert to the specified timezone if provided (already validated by express-validator)
        let offset = "(\\+00\\:00)";
        if (timezone) {
            startTimestamp = startTimestamp.setZone(timezone);
            // Calculate offset in (+/-hh:mm) format
            const offsetMinutes = startTimestamp.offset; // Offset in minutes
            const sign = offsetMinutes >= 0 ? '+' : '-'; // Determine the sign
            const hours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, '0'); // Hours part
            const minutes = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0'); // Minutes part
            offset = `(\\${sign}${hours}\\:${minutes})`; // Format as (+/-hh:mm) and escape for FFmpeg drawtext
        }

        // Convert the timestamp to milliseconds for the specified timezone
        const startTimestampMs = startTimestamp.toMillis() + (startTimestamp.offset * 60 * 1000);

        // Create a read stream from GCS
        const videoStream = remoteFile.createReadStream();

        // Timeout configuration
        const STREAM_TIMEOUT = 30000; // 30 seconds timeout
        let gcsDataTimeout = null;
        let responseDataTimeout = null;
        let hasReceivedResponseData = false;

        // Function to handle timeout
        const handleTimeout = (reason) => {
            logger.error(`Stream timeout: ${reason}`);
            if (!res.headersSent) {
                res.status(504).send(`Stream timeout: ${reason}`);
            } else {
                res.destroy(); // Force close the connection
            }
            videoStream.destroy();
            ffmpeg.kill('SIGKILL');
        };

        // Monitor GCS data flow
        const resetGcsTimeout = () => {
            if (gcsDataTimeout) clearTimeout(gcsDataTimeout);
            gcsDataTimeout = setTimeout(() => {
                handleTimeout('No data received from GCS for 30 seconds');
            }, STREAM_TIMEOUT);
        };

        // Monitor response data flow
        const resetResponseTimeout = () => {
            if (responseDataTimeout) clearTimeout(responseDataTimeout);
            responseDataTimeout = setTimeout(() => {
                handleTimeout('No data sent to response for 30 seconds');
            }, STREAM_TIMEOUT);
        };

        // Clear all timeouts
        const clearAllTimeouts = () => {
            if (gcsDataTimeout) {
                clearTimeout(gcsDataTimeout);
                gcsDataTimeout = null;
            }
            if (responseDataTimeout) {
                clearTimeout(responseDataTimeout);
                responseDataTimeout = null;
            }
        };

        // Start GCS timeout
        resetGcsTimeout();

        videoStream.on('data', (chunk) => {
            logger.debug(`GCS stream chunk received: ${chunk.length} bytes`);
            resetGcsTimeout();
        });

        videoStream.on('end', () => {
            logger.debug('GCS stream ended');
            if (gcsDataTimeout) {
                clearTimeout(gcsDataTimeout);
                gcsDataTimeout = null;
            }
        });

        const fileName = videoPath.split('/').pop();

        // Set response headers for streaming
        res.writeHead(200, {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="annotated_${fileName}"`,
        });

        const locationY = location ? 10 : null;
        const cameraY = camera ? (location ? 48 : 10) : null;
        const timestampY = (location || camera) ? (camera ? 86 : 48) : 10;

        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0', // Input from stdin
            '-vf', (location ?
                        `drawtext=text='${location}'` +
                            `:x=10:y=${locationY}:fontsize=24:fontcolor=white` +
                            `:box=1:boxcolor=black@0.5:boxborderw=10,` :
                        '') +
                   (camera ?
                        `drawtext=text='${camera}'` +
                            `:x=10:y=${cameraY}:fontsize=24:fontcolor=white` +
                            `:box=1:boxcolor=black@0.5:boxborderw=10,` :
                        '') +
                    `drawtext=` + 
                        `expansion=` + 
                            `strftime` + 
                                `:basetime=${startTimestampMs * 1000}` +
                                `:text='%Y-%m-%d %H\\:%M\\:%S ${offset}'` +
                                `:x=10:y=${timestampY}` +
                                `:fontcolor=white` + 
                                `:box=1:boxcolor=black@0.5:boxborderw=10` +
                                `:fontsize=24`, // Overlay filter
            '-c:v', 'libx264', // Re-encode video with H.264
            '-preset', 'ultrafast', // Use ultrafast preset for minimal latency
            '-c:a', 'copy', // Copy audio without re-encoding
            '-movflags', 'frag_keyframe+empty_moov', // Enable fragmented MP4 for non-seekable output
            '-f', 'mp4', // Output format
            'pipe:1', // Output to stdout
        ], isDebug ?  { stdio: ['pipe', 'pipe', 'inherit'] } : {});

        // Handle FFmpeg errors
        ffmpeg.on('error', (err) => {
            logger.error('FFmpeg error:', err);
            clearAllTimeouts();
            if (!res.headersSent) {
                res.status(500).send("Error processing the video");
            }
        });

        // Create buffering streams
        const bufferStreamToFFmpeg = new MP4BufferingStream();
        const bufferStreamToResponse = new PassThrough();

        if (isDebug) {
            // for debugging purposes, log the flow of data through the buffers
            // Add 'data' listener to monitor data flow (optional, for debugging)
            bufferStreamToFFmpeg.on('data', (chunk) => {
                logger.debug(`Buffer to FFmpeg received ${chunk.length} bytes`);
            });

            // Add 'drain' listener to handle backpressure (optional)
            bufferStreamToFFmpeg.on('drain', () => {
                logger.debug('Buffer to FFmpeg drained');
            });

            bufferStreamToResponse.on('drain', () => {
                logger.debug('Buffer to Response drained');
            });
        }

        bufferStreamToResponse.on('data', (chunk) => {
            logger.debug(`Buffer to Response received ${chunk.length} bytes`);
            
            // Start response timeout after first data from FFmpeg
            if (!hasReceivedResponseData) {
                hasReceivedResponseData = true;
                resetResponseTimeout();
            } else {
                resetResponseTimeout();
            }
        });

        bufferStreamToResponse.on('end', () => {
            logger.debug('Buffer to Response ended');
            clearAllTimeouts();
        });

        videoStream.on('error', (err) => {
            logger.error('Video stream error:', err);
            clearAllTimeouts();
            ffmpeg.kill();
        });

        bufferStreamToFFmpeg.on('error', (err) => {
            logger.error('Buffer to FFmpeg error:', err);
            clearAllTimeouts();
            ffmpeg.kill();
        });

        bufferStreamToResponse.on('error', (err) => {
            logger.error('Buffer to Response error:', err);
            clearAllTimeouts();
            ffmpeg.kill();
        });

        ffmpeg.stdin.on('error', (err) => {
            logger.error('FFmpeg stdin error:', err);
        });

        ffmpeg.stdout.on('error', (err) => {
            logger.error('FFmpeg stdout error:', err);
        });

        // Pipe the video stream to the buffering stream, then to FFmpeg's stdin
        videoStream.pipe(bufferStreamToFFmpeg).pipe(ffmpeg.stdin);

        // Pipe FFmpeg's stdout to the buffering stream, then to the response
        ffmpeg.stdout.pipe(bufferStreamToResponse).pipe(res);

        // Handle video stream errors
        videoStream.on('error', (streamErr) => {
            logger.error('Video stream error:', streamErr);
            clearAllTimeouts();
            if (!res.headersSent) {
                res.status(500).send("Error reading the video file");
            }
            ffmpeg.kill(); // Kill FFmpeg process on error
        });

        // Handle client disconnects
        res.on('close', () => {
            logger.info('Client disconnected');
            clearAllTimeouts();
            videoStream.destroy(); // Destroy the GCS stream
            ffmpeg.kill(); // Kill the FFmpeg process
        });

        // Handle FFmpeg process exit
        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                logger.error(`FFmpeg process exited with code ${code}`);
            }
            clearAllTimeouts();
        });

        // Handle response errors (e.g., EPIPE)
        res.on('error', (err) => {
            logger.error('Response error:', err);
            clearAllTimeouts();
            videoStream.destroy(); // Destroy the GCS stream
            ffmpeg.kill(); // Kill the FFmpeg process
        });
    } catch (err) {
        logger.error(err);
        if (!res.headersSent) {
            res.status(500).send(`Error retrieving video: ${err.message}`);
        }
    }
});

module.exports = router;