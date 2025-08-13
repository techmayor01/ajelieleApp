require("dotenv").config();

const express = require("express");
const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

const mongoose = require("mongoose");
const mongodb = require("mongodb");
const fs = require('fs');
const logStream = fs.createWriteStream('service-error.log', { flags: 'a' });

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  logStream.write(`[${new Date()}] Uncaught Exception: ${err.stack || err}\n`);
});

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logStream.write(`[${new Date()}] Unhandled Rejection: ${reason}\n`);
});


mongoose
  .connect(process.env.DB)
  .then((done) => {
    let port = process.env.PORT || 3001;
    if(port == null || port == ""){
      port = 3001
    }
    app.listen(port, () => console.log(`Server running on Port ${port}`));
    console.log("Db connected");
  })
.catch((err) => console.log(err));
                    




app.use(require("./routes/auth"));
app.use(require("./routes/main"));
app.use(require("./routes/stockLogic"));
app.use(require("./routes/sales"));


app.use((err, req, res, next) => {
  const backUrl = req.get('Referer') || '/';

  res.status(err.status || 500).render('Auth/error', {
    error: {
      status: err.status || 500,
      message: err.message || "Internal Server Error",
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    },
    backUrl
  });
});

