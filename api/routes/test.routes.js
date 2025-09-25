const express = require('express');

const router = express.Router();
const baseUrl = process.env.BASE_URL || "/api";

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

module.exports = router;