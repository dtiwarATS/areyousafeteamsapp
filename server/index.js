const path = require("path");
const express = require("express");
const cors = require("cors");
const poolPromise = require("./db/dbConn");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const PORT = process.env.PORT || 3978;
const server = express();

server.use(cors());
server.use(express.json());
server.use(
  express.urlencoded({
    extended: true,
  })
);
server.use("/api", require("./api"));

server.get("/", (req, res) => {
  res.send(
    `<h2>The Are You Safe app is running</h2>
    <p>Follow the instructions in the README to configure the Microsoft Teams App and your environment variables.</p>`
  );
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
