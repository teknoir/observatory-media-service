const express = require('express')
const {Storage} = require("@google-cloud/storage");
const router = express.Router()

const baseUrl = process.env.BASE_URL || "/api"
router.get('/', (req, res) => {
    res.redirect(`${baseUrl}/test/videotest/boxer_property_3`);
});

router.get(/^\/test\/([a-zA-Z:/0-9._-]*)/, function (req, res) {
    let protocol = (req.hostname === 'localhost') ? 'http' : 'https'
    let videoPath = `${protocol}://${req.get('host')}${baseUrl}/mp4/${req.params[0]}.mp4`
    let screenshotPath = req.params[0].replace('videos', 'snapshots').replace('video', 'snapshots')
    let imagePath = `${protocol}://${req.get('host')}${baseUrl}/jpeg/${screenshotPath}.jpeg`
    res.render('home', {
        videoPath: videoPath,
        imagePath: imagePath,
    });
});

router.get(/^\/html\/([a-zA-Z:/0-9._-]*.mp4)/, function (req, res) {
    let protocol = (req.hostname === 'localhost') ? 'http' : 'https'
    let videoPath = `${protocol}://${req.get('host')}${baseUrl}/mp4/${req.params[0]}`
    res.render('video', {
        videoPath: videoPath,
    });
});

router.get(/^\/html\/([a-zA-Z:/0-9._-]*.(jpeg|jpg))/, function (req, res) {
    let protocol = (req.hostname === 'localhost') ? 'http' : 'https'
    let imagePath = `${protocol}://${req.get('host')}${baseUrl}/jpeg/${req.params[0]}`
    res.render('image', {
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

router.get(/^\/jpeg\/([a-zA-Z:/0-9._-]*.(jpeg|jpg))/, async function (req, res) {
    let imagePath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(imagePath);
        const [metadata, response] = await remoteFile.getMetadata()
        if (metadata.contentType != 'image/jpeg') {
            res.status(400).send("This service only serves content that is image/jpeg for now");
        }

        // Create headers
        const headers = {
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

router.get(/^\/json\/([a-zA-Z:/0-9._-]*.json)/, async function (req, res) {
    // get annotation file metadata and size
    let annotationsPath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(annotationsPath);
        const [metadata, response] = await remoteFile.getMetadata()
        if (metadata.contentType != 'application/json') {
            res.status(400).send("This service only serves content that is application/json for now");
        }

        // Create headers
        const headers = {
            "Content-Type": 'application/json',
        };

        // HTTP Status 206 for Partial Content
        res.writeHead(206, headers);

        // create read stream for this annotations file
        const annotationsStream = remoteFile.createReadStream();

        // Stream the annotation file to the client
        annotationsStream.pipe(res);
    } catch (err) {
        console.log(err);
        res.status(404).send(`File not found ${err}`);
    }
});

router.post(/^\/files\/([a-zA-Z:/0-9._-]*)/, async function (req, res) {
    let dirPath = req.params[0];
    const { start, end, limit, pageToken } = req.body;

    if (start === undefined || end === undefined || limit === undefined) {
        return res.status(400).send("Missing required parameters: start, end, or limit");
    }

    const cursorLimit = 2000; // Maximum number of files to fetch per request to GCS
    let collectedFiles = [];
    let nextPageToken = pageToken || null;

    // Determine the common prefix between start and end
    const getCommonPrefix = (str1, str2) => {
        let i = 0;
        while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
            i++;
        }
        return str1.substring(0, i);
    };
    const commonPrefix = getCommonPrefix(start, end);
    console.log(`Common prefix: ${commonPrefix}`);

    try {
        const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const fullStart = `${dirPath}/${start}`;
        const fullEnd = `${dirPath}/${end}`;

        // Loop to fetch files until the limit is reached or no more files are available
        do {
            console.log(`Fetching files with prefix: ${dirPath}/${commonPrefix}, pageToken: ${nextPageToken}`);
            const [files, query] = await bucket.getFiles({
                prefix: `${dirPath}/${commonPrefix}`, // Use the common prefix to narrow down results
                maxResults: cursorLimit,
                pageToken: nextPageToken,
            });

            console.log(`Fetched ${files.length} files`);

            // Filter files based on the start and end range
            const filteredFiles = files
                .map(file => {
                    console.log(`Processing file: ${file.name}`);
                   return file.name;
                })
                .filter(fileName => fileName.localeCompare(fullStart) >= 0 && fileName.localeCompare(fullEnd) <= 0);

            console.log(`Filtered down to ${filteredFiles.length} files within range ${start} to ${end}`);

            // Add filtered files to the collected list
            collectedFiles = collectedFiles.concat(filteredFiles);

            // Update the nextPageToken for the next iteration
            nextPageToken = query?.pageToken || null;

        } while (nextPageToken && collectedFiles.length < limit);

        // Trim the collected files to the requested limit
        const paginatedFiles = collectedFiles.slice(0, limit);

        console.log(`Returning ${paginatedFiles.length} files after pagination`);

        // Prepare the response
        const response = {
            files: paginatedFiles,
            nextPageToken: nextPageToken || null, // Include the next page token if available
        };

        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Error retrieving files: ${err.message}`);
    }
});

module.exports = router