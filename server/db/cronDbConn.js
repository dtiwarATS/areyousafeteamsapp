const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const sql = require("mssql");

const CRON_POOL_MAX = Number(process.env.CRON_DB_POOL_MAX) || 10;

const getCronDbConfig = () => ({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  server: process.env.SERVER,
  port: 1433,
  connectionTimeout: 300000,
  requestTimeout: 300000,
  pool: {
    max: CRON_POOL_MAX,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    trustServerCertificate: true,
    encrypt: true,
  },
});

const createCronPool = async () => {
  return await new sql.ConnectionPool(getCronDbConfig()).connect();
};

const cronPoolPromise = createCronPool()
  .then((pool) => {
    console.log(
      `[Cron DB] Connected successfully (pool max=${CRON_POOL_MAX}) to MSSQL Server=${process.env.SERVER}; Database=${process.env.DB_NAME}`,
    );
    return pool;
  })
  .catch((err) => {
    console.log("[Cron DB] Database Connection Failed! Bad Config: ", err);
    throw err;
  });

module.exports = cronPoolPromise;
module.exports.getCronDbConfig = getCronDbConfig;
module.exports.CRON_POOL_MAX = CRON_POOL_MAX;
