const express = require('express');
const { Storage } = require("@google-cloud/storage");
const logger = require('../../helpers/logger');

const router = express.Router();

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
    logger.debug(`Common prefix: ${commonPrefix}`);

    try {
        const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
        const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);
        const fullStart = `${dirPath}/${start}`;
        const fullEnd = `${dirPath}/${end}`;

        // Loop to fetch files until the limit is reached or no more files are available
        do {
            logger.debug(`Fetching files with prefix: ${dirPath}/${commonPrefix}, pageToken: ${nextPageToken}`);
            const [files, query] = await bucket.getFiles({
                prefix: `${dirPath}/${commonPrefix}`, // Use the common prefix to narrow down results
                maxResults: cursorLimit,
                pageToken: nextPageToken,
            });

            logger.debug(`Fetched ${files.length} files`);

            // Filter files based on the start and end range
            const filteredFiles = files
                .map(file => {
                    logger.debug(`Processing file: ${file.name}`);
                   return file.name;
                })
                .filter(fileName => fileName.localeCompare(fullStart) >= 0 && fileName.localeCompare(fullEnd) <= 0);

            logger.debug(`Filtered down to ${filteredFiles.length} files within range ${start} to ${end}`);

            // Add filtered files to the collected list
            collectedFiles = collectedFiles.concat(filteredFiles);

            // Update the nextPageToken for the next iteration
            nextPageToken = query?.pageToken || null;

        } while (nextPageToken && collectedFiles.length < limit);

        // Trim the collected files to the requested limit
        const paginatedFiles = collectedFiles.slice(0, limit);

        logger.debug(`Returning ${paginatedFiles.length} files after pagination`);

        // Prepare the response
        const response = {
            files: paginatedFiles,
            nextPageToken: nextPageToken || null, // Include the next page token if available
        };

        res.status(200).json(response);
    } catch (err) {
        logger.error(err);
        res.status(500).send(`Error retrieving files: ${err.message}`);
    }
});

module.exports = router;