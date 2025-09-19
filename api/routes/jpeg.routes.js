const express = require('express');
const { Storage } = require("@google-cloud/storage");
const logger = require('../../helpers/logger');

const router = express.Router();

router.get(/^\/jpeg\/([a-zA-Z:/0-9._-]*.(jpeg|jpg))/, async function (req, res) {
    let imagePath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(imagePath);
        const [metadata] = await remoteFile.getMetadata()
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
        imageStream.on('error', (streamErr) => {
            logger.error('Image stream error:', streamErr);
        });

        // Stream the image to the client
        imageStream.pipe(res);
    } catch (err) {
        logger.error(err);
        res.status(404).send(`File not found ${err}`);
    }
});

module.exports = router;