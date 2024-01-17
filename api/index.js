const express = require('express')
const {Storage} = require("@google-cloud/storage");
const router = express.Router()

const baseUrl = process.env.BASE_URL || "/api"
router.get('/', (req, res) => {
    res.redirect(`${baseUrl}/test/videotest/boxer_property_3`);
});

router.get(/^\/test\/([a-zA-Z:/0-9._-]*)/, function (req, res) {
    let protocol = (req.get['host'] === 'localhost') ? 'http' : 'https'
    let videoPath = `${protocol}://${req.get('host')}${baseUrl}/mp4/${req.params[0]}.mp4`
    let imagePath = `${protocol}://${req.get('host')}${baseUrl}/jpeg/${req.params[0]}.jpeg`
    res.render('home', {
        videoPath: videoPath,
        imagePath: imagePath,
    });
});

router.get(/^\/mp4\/([a-zA-Z:/0-9._-]*.mp4)/, async function (req, res) {
    // Ensure there is a range given for the video (that it is being streamed)
    const range = req.headers.range;
    if (!range) {
        res.status(400).send("Requires Range header");
    }

    // get video metadata and size
    let videoPath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(videoPath);
        const [metadata, response] = await remoteFile.getMetadata()
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

        // Stream the video chunk to the client
        videoStream.pipe(res);
    } catch (err) {
        console.log(err);
        res.status(404).send(`File not found ${err}`);
    }
});

router.get(/^\/jpeg\/([a-zA-Z:/0-9._-]*.jpeg)/, async function (req, res) {
    // // Ensure there is a range given for the video (that it is being streamed)
    // const range = req.headers.range;
    // if (!range) {
    //     res.status(400).send("Requires Range header");
    // }

    // get video metadata and size
    let imagePath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(imagePath);
        const [metadata, response] = await remoteFile.getMetadata()
        if (metadata.contentType != 'image/jpeg') {
            res.status(400).send("This service only serves content that is image/jpeg for now");
        }
        // const videoSize = metadata.size;

        // // Parse Range
        // // Example: "bytes=32324-"
        // const CHUNK_SIZE = 10 ** 6; // 1MB
        // const start = Number(range.replace(/\D/g, ""));
        // const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

        // Create headers
        // const contentLength = end - start + 1;
        const headers = {
            // "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            // "Accept-Ranges": "bytes",
            // "Content-Length": contentLength,
            "Content-Type": 'image/jpeg',
        };

        // HTTP Status 206 for Partial Content
        res.writeHead(206, headers);

        // create video read stream for this particular chunk
        const imageStream = remoteFile.createReadStream();

        // Stream the video chunk to the client
        imageStream.pipe(res);
    } catch (err) {
        console.log(err);
        res.status(404).send(`File not found ${err}`);
    }
});

module.exports = router