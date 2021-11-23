const path = require("path");
const express = require("express");
const cors = require("cors");
const poolPromise = require("./db/dbConn");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const PORT = process.env.PORT || 3978;
const app = express();

const closeConnectionPool = async () => {
  const pool = await poolPromise;
  if (pool) {
    return pool.close();
  }
  return Promise.resolve();
};

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use("/api", require("./api"));

app.get("/", (req, res) => {
  res.send(
    `<h2>The Are You Safe app is running</h2>
    <p>Follow the instructions in the README to configure the Microsoft Teams App and your environment variables.</p>`
  );
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

function shutDown() {
  console.log("Closing server...");
  server.close(() => {
    console.log("Server closed successfully");
    // close SQL connection pool
    closeConnectionPool().then(() => {
      console.log(`SQL Connection Pool closed successfully`);
    });
  });
}
