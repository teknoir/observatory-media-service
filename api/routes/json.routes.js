const express = require('express');
const { Storage } = require("@google-cloud/storage");
const logger = require('../../helpers/logger');

const router = express.Router();

router.get(/^\/json\/([a-zA-Z:/0-9._-]*.json)/, async function (req, res) {
    // get annotation file metadata and size
    let annotationsPath = req.params[0];
    try {
        const storage = new Storage({projectId: process.env.GOOGLE_CLOUD_PROJECT});
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const remoteFile = bucket.file(annotationsPath);
        const [metadata] = await remoteFile.getMetadata()
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

        annotationsStream.on('error', (streamErr) => {
            logger.error('JSON stream error:', streamErr);
        });

        // Stream the annotation file to the client
        annotationsStream.pipe(res);
    } catch (err) {
        logger.error(err);
        res.status(404).send(`File not found ${err}`);
    }
});

module.exports = router;