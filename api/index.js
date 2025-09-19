const express = require('express');
const router = express.Router();

// Import route modules
const mp4Routes = require('./routes/mp4.routes');
const jpegRoutes = require('./routes/jpeg.routes');
const jsonRoutes = require('./routes/json.routes');
const filesRoutes = require('./routes/files.routes');
const htmlRoutes = require('./routes/html.routes');
const testRoutes = require('./routes/test.routes');

const baseUrl = process.env.BASE_URL || "/api";

// Default route
router.get('/', (req, res) => {
    res.redirect(`${baseUrl}/test/videotest/boxer_property_3`);
});

// Use route modules
router.use('/', mp4Routes);
router.use('/', jpegRoutes);
router.use('/', jsonRoutes);
router.use('/', filesRoutes);
router.use('/', htmlRoutes);
router.use('/', testRoutes);

module.exports = router;