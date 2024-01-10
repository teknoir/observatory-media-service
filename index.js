const express = require("express");
const { engine }  = require('express-handlebars');

const app = express();
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

const baseUrl = process.env.BASE_URL || "/api"
app.use(baseUrl, require('./api'));

app.listen(8000, function () {
  console.log("Listening on port 8000!");
});
