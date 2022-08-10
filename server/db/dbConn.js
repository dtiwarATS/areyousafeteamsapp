const path = require("path");
const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });
const sql = require("mssql");

// const config = `Server=${process.env.SERVER};Database=${process.env.DB_NAME};User Id=${process.env.DB_USER};Password=${process.env.DB_PWD};Encrypt=true`;

const createPool = async () => {
  const config = { options: {} };
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASS;
  config.database = process.env.DB_NAME;
  config.server = process.env.SERVER;
  config.port = 1433;
  config.connectionTimeout = 99000;
  config.options.trustServerCertificate = true;
  config.options.encrypt = true;
  return await sql.connect(config);
};

const poolPromise = createPool()
  .then(async (pool) => {
    console.log(
      `Connected sucessfully to MSSQL Server=${process.env.SERVER}; Database=${process.env.DB_NAME}`
    );
    return pool;
  })
  .catch((err) => {
    console.log("Database Connection Failed! Bad Config: ", err);
    throw err;
  });

module.exports = poolPromise;
