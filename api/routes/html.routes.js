const express = require('express');

const router = express.Router();
const baseUrl = process.env.BASE_URL || "/api";

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

module.exports = router;