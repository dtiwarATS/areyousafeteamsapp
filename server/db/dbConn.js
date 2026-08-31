const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const sql = require("mssql");

const getAppDbConfig = () => ({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  server: process.env.SERVER,
  port: 1433,
  connectionTimeout: 300000,
  requestTimeout: 300000,
  options: {
    trustServerCertificate: true,
    encrypt: true,
  },
});

const createPool = async () => {
  return await sql.connect(getAppDbConfig());
};

const poolPromise = createPool()
  .then(async (pool) => {
    console.log(
      `Connected sucessfully to MSSQL Server=${process.env.SERVER}; Database=${process.env.DB_NAME}`,
    );
    return pool;
  })
  .catch((err) => {
    console.log("Database Connection Failed! Bad Config: ", err);
    throw err;
  });

module.exports = poolPromise;
module.exports.getAppDbConfig = getAppDbConfig;
module.exports.getDbConfig = getAppDbConfig;
