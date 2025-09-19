const express = require("express");
const { engine }  = require('express-handlebars');
const cors = require('cors');

const app = express();
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

const baseUrl = process.env.BASE_URL || "/api"
// Add middleware to parse JSON request bodies
app.use(express.json());
app.use(cors());
app.use(baseUrl, require('./api'));

const server = app.listen(8000, function () {
  console.log("Listening on port 8000!");
});

// Handle interrupt signals (e.g., Ctrl+C)
process.on('SIGINT', () => {
  console.log("\nGracefully shutting down...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
