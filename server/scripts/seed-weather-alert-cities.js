/**
 * Seed CountryList and CityList from Azure coverage list + GeoNames cities5000.
 *
 * Usage (from areyousafeteamsapp folder):
 *   node server/scripts/seed-weather-alert-cities.js
 *
 * Requires .env with DB connection (SERVER, DB_NAME, DB_USER, DB_PASS).
 * Downloads GeoNames cities5000.zip and admin1CodesASCII.txt (cached in server/scripts/.geonames-cache/).
 *
 * Safe to re-run: clears and reloads both tables.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const sql = require("mssql");

const ENV_FILE = path.join(__dirname, "../../.env");
require("dotenv").config({ path: ENV_FILE });

const COUNTRIES_JSON = path.join(
  __dirname,
  "azure-weather-alert-countries.json",
);
const CACHE_DIR = path.join(__dirname, ".geonames-cache");
const CITIES_ZIP = path.join(CACHE_DIR, "cities5000.zip");
const CITIES_TXT = path.join(CACHE_DIR, "cities5000.txt");
const ADMIN1_TXT = path.join(CACHE_DIR, "admin1CodesASCII.txt");

const CITIES5000_URL = "https://download.geonames.org/export/dump/cities5000.zip";
const ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";

function downloadFile(url, dest, force = false) {
  return new Promise((resolve, reject) => {
    if (!force && fs.existsSync(dest)) {
      resolve(dest);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          downloadFile(response.headers.location, dest, force).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(new Error(`Download failed ${url}: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(dest);
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

function extractCities5000() {
  if (fs.existsSync(CITIES_TXT)) return;

  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${CITIES_ZIP.replace(/'/g, "''")}' -DestinationPath '${CACHE_DIR.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${CITIES_ZIP}" -d "${CACHE_DIR}"`, { stdio: "inherit" });
  }

  if (!fs.existsSync(CITIES_TXT)) {
    throw new Error(`Expected ${CITIES_TXT} after extracting cities5000.zip`);
  }
}

function loadAdmin1Map() {
  const map = new Map();
  const content = fs.readFileSync(ADMIN1_TXT, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 2) continue;
    const key = parts[0].trim();
    const name = (parts[1] || "").trim();
    if (key && name) map.set(key, name);
  }
  return map;
}

function loadCountries() {
  const raw = fs.readFileSync(COUNTRIES_JSON, "utf8");
  return JSON.parse(raw);
}

function parseCities5000(isoCodes, admin1Map) {
  const isoSet = new Set(isoCodes.map((c) => c.toUpperCase()));
  const cities = [];
  const seen = new Set();
  const content = fs.readFileSync(CITIES_TXT, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split("\t");
    if (cols.length < 15) continue;

    const name = cols[1];
    const lat = parseFloat(cols[4]);
    const lon = parseFloat(cols[5]);
    const countryCode = (cols[8] || "").toUpperCase();
    const admin1Code = cols[10] || "";

    if (!isoSet.has(countryCode)) continue;
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const dedupKey = `${countryCode}|${name}|${admin1Code}|${lat}|${lon}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    let state = null;
    if (admin1Code) {
      state = admin1Map.get(`${countryCode}.${admin1Code}`) || null;
    }

    cities.push({
      isoCode: countryCode,
      cityName: name,
      state,
      latitude: lat,
      longitude: lon,
    });
  }

  return cities;
}

async function getPool() {
  const config = {
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
  };
  return sql.connect(config);
}

async function seedCountries(pool, countries) {
  await pool.request().query("DELETE FROM CityList");
  await pool.request().query("DELETE FROM CountryList");

  const idByIso = new Map();
  for (const country of countries) {
    const result = await pool
      .request()
      .input("CountryName", sql.NVarChar(200), country.name)
      .input("Code", sql.NVarChar(10), country.code)
      .input("Region", sql.NVarChar(50), country.region)
      .query(`
        INSERT INTO CountryList (CountryName, Code, Region)
        OUTPUT INSERTED.Id
        VALUES (@CountryName, @Code, @Region)
      `);
    const id = result.recordset[0].Id;
    idByIso.set(country.isoCode.toUpperCase(), id);
  }
  return idByIso;
}

async function seedCities(pool, cities, idByIso) {
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < cities.length; i += BATCH) {
    const batch = cities.slice(i, i + BATCH);
    const request = pool.request();
    const values = [];
    let paramIdx = 0;

    for (const city of batch) {
      const countryId = idByIso.get(city.isoCode);
      if (!countryId) continue;

      request.input(`countryId${paramIdx}`, sql.Int, countryId);
      request.input(`cityName${paramIdx}`, sql.NVarChar(200), city.cityName);
      request.input(`state${paramIdx}`, sql.NVarChar(100), city.state);
      request.input(`lat${paramIdx}`, sql.Decimal(10, 7), city.latitude);
      request.input(`lon${paramIdx}`, sql.Decimal(10, 7), city.longitude);

      values.push(
        `(@countryId${paramIdx}, @cityName${paramIdx}, @state${paramIdx}, @lat${paramIdx}, @lon${paramIdx})`,
      );
      paramIdx++;
    }

    if (values.length === 0) continue;

    await request.query(`
      INSERT INTO CityList (CountryId, CityName, State, Latitude, Longitude)
      VALUES ${values.join(", ")}
    `);

    inserted += values.length;
    process.stdout.write(`\rInserted ${inserted} cities...`);
  }

  process.stdout.write("\n");
  return inserted;
}

async function main() {
  const refreshGeoNames = process.argv.includes("--refresh-geonames");

  console.log("Loading country list...");
  const countries = loadCountries();
  const isoCodes = countries.map((c) => c.isoCode);

  console.log("Downloading GeoNames data...");
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  await downloadFile(ADMIN1_URL, ADMIN1_TXT, refreshGeoNames);
  await downloadFile(CITIES5000_URL, CITIES_ZIP, refreshGeoNames);
  if (refreshGeoNames && fs.existsSync(CITIES_TXT)) {
    fs.unlinkSync(CITIES_TXT);
  }
  extractCities5000();

  console.log("Parsing cities...");
  const admin1Map = loadAdmin1Map();
  const cities = parseCities5000(isoCodes, admin1Map);
  console.log(`Found ${cities.length} cities across ${countries.length} countries.`);

  console.log("Connecting to database...");
  const pool = await getPool();

  console.log("Seeding countries...");
  const idByIso = await seedCountries(pool, countries);

  console.log("Seeding cities...");
  const inserted = await seedCities(pool, cities, idByIso);

  const summary = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM CountryList) AS CountryCount,
      (SELECT COUNT(*) FROM CityList) AS CityCount
  `);

  const { CountryCount, CityCount } = summary.recordset[0];
  console.log(`Done. Countries: ${CountryCount}, Cities: ${CityCount} (inserted ${inserted}).`);

  await pool.close();
}

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
