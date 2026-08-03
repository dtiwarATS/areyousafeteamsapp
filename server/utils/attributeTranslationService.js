const sql = require("mssql");
const poolPromise = require("../db/dbConn");

const DEFAULT_LANGUAGE_ID = 10000;
/** Attribute keys whose values are language-specific templates (not freeform team text). */
const KNOWN_DEFAULT_ATTRIBUTE_KEYS = [
  "doYouHaveAnyVisitorsOnSite",
  "areAllYourVisitorsSafe",
  "howCanIHelp",
  "iAmSafe",
  "iNeedAssistance",
  "acknowledged",
  "thisIsASafetyCheckFrom",
  "copyOf",
  "travelAdvisory",
  "safetyAlert",
  "importantBulletin",
  "stakeholderNotice",
  "safetyCheck",
];

/** @type {Map<number, Map<string, string>>} */
const cacheByLanguageId = new Map();

/** @type {Map<number, Promise<Map<string, string>>>} */
const inflightLoads = new Map();

/** @type {Promise<Record<string, string[]>> | null} */
let knownDefaultAttributeValuesPromise = null;

function normalizeLanguageId(languageId) {
  const n = Number(languageId);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LANGUAGE_ID;
  return n;
}

/**
 * Load all attribute translations for a LANGUAGE_ID into an in-memory map.
 * @param {number|string} languageId
 * @returns {Promise<Map<string, string>>}
 */
async function loadLanguage(languageId) {
  const resolved = normalizeLanguageId(languageId);
  if (cacheByLanguageId.has(resolved)) {
    return cacheByLanguageId.get(resolved);
  }
  if (inflightLoads.has(resolved)) {
    return inflightLoads.get(resolved);
  }

  const loadPromise = (async () => {
    const dict = new Map();
    try {
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("languageId", sql.Int, resolved)
        .query(`
          SELECT
            SA.ATTRIBUTE AS AttributeName,
            SADT.ATTRIBUTE AS TranslatedAttribute
          FROM SYS_ATTRIBUTE_DEF SA
          INNER JOIN SYS_ATTRIBUTE_DEF_TRANS SADT
            ON SA.ATTRIBUTE_ID = SADT.ATTRIBUTE_ID
          WHERE SADT.LANGUAGE_ID = @languageId
        `);

      for (const row of result.recordset || []) {
        const key = row.AttributeName;
        const value =
          typeof row.TranslatedAttribute === "string"
            ? row.TranslatedAttribute
            : "";
        if (key && value !== "") {
          dict.set(String(key), value);
        }
      }
    } catch (err) {
      console.error(
        `[attributeTranslationService] loadLanguage(${resolved}) failed:`,
        err?.message || err,
      );
    }

    cacheByLanguageId.set(resolved, dict);
    inflightLoads.delete(resolved);
    return dict;
  })();

  inflightLoads.set(resolved, loadPromise);
  try {
    return await loadPromise;
  } catch (err) {
    inflightLoads.delete(resolved);
    throw err;
  }
}

/**
 * Get a single translated attribute. Falls back to English then fallback arg.
 * @param {string} key
 * @param {number|string} languageId
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
async function getText(key, languageId, fallback) {
  if (!key) return fallback != null ? fallback : "";
  const resolved = normalizeLanguageId(languageId);
  const dict = await loadLanguage(resolved);
  const value = dict.get(key);
  if (value != null && value !== "") return value;

  if (resolved !== DEFAULT_LANGUAGE_ID) {
    const enDict = await loadLanguage(DEFAULT_LANGUAGE_ID);
    const enValue = enDict.get(key);
    if (enValue != null && enValue !== "") return enValue;
  }

  return fallback != null ? fallback : key;
}

/**
 * Synchronous lookup against already-cached dictionaries only.
 * Prefer getText for correctness; this is for hot paths that already warmed cache.
 */
function getTextCached(key, languageId, fallback) {
  if (!key) return fallback != null ? fallback : "";
  const resolved = normalizeLanguageId(languageId);
  const dict = cacheByLanguageId.get(resolved);
  const value = dict?.get(key);
  if (value != null && value !== "") return value;

  if (resolved !== DEFAULT_LANGUAGE_ID) {
    const enValue = cacheByLanguageId.get(DEFAULT_LANGUAGE_ID)?.get(key);
    if (enValue != null && enValue !== "") return enValue;
  }

  return fallback != null ? fallback : key;
}

/**
 * Return a plain object dictionary for API responses / SOS helpers.
 * @param {number|string} languageId
 * @returns {Promise<Record<string, string>>}
 */
async function getDictionary(languageId) {
  const dict = await loadLanguage(languageId);
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of dict.entries()) {
    out[k] = v;
  }
  return out;
}

/**
 * All DB-backed default template values across every installed language.
 * Lets the UI distinguish translated defaults from custom team text after a
 * language change, copy, or page reload.
 */
async function getVisitorQuestionValues() {
  if (knownDefaultAttributeValuesPromise) return knownDefaultAttributeValuesPromise;

  knownDefaultAttributeValuesPromise = (async () => {
    const values = Object.fromEntries(
      KNOWN_DEFAULT_ATTRIBUTE_KEYS.map((key) => [key, []]),
    );
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT SA.ATTRIBUTE AS AttributeName, SADT.ATTRIBUTE AS TranslatedAttribute
        FROM SYS_ATTRIBUTE_DEF SA
        INNER JOIN SYS_ATTRIBUTE_DEF_TRANS SADT
          ON SADT.ATTRIBUTE_ID = SA.ATTRIBUTE_ID
        WHERE SA.ATTRIBUTE IN (
          N'doYouHaveAnyVisitorsOnSite',
          N'areAllYourVisitorsSafe',
          N'howCanIHelp',
          N'iAmSafe',
          N'iNeedAssistance',
          N'acknowledged',
          N'thisIsASafetyCheckFrom',
          N'copyOf',
          N'travelAdvisory',
          N'safetyAlert',
          N'importantBulletin',
          N'stakeholderNotice',
          N'safetyCheck'
        )
          AND ISNULL(SADT.ATTRIBUTE, N'') <> N''
      `);
      for (const row of result.recordset || []) {
        if (values[row.AttributeName]) {
          values[row.AttributeName].push(String(row.TranslatedAttribute));
        }
      }
    } catch (err) {
      console.error(
        "[attributeTranslationService] known default attribute lookup failed:",
        err?.message || err,
      );
    }
    return values;
  })();

  return knownDefaultAttributeValuesPromise;
}

/**
 * Shape expected by the tab UI TranslationProvider:
 * { [AttributeName]: { AttributeName, TranslatedAttribute, Language, CULTURECODE? } }
 */
async function getUiTranslationDict(languageId) {
  const resolved = normalizeLanguageId(languageId);
  let languageName = "";
  let cultureCode = "";

  try {
    const pool = await poolPromise;
    const langResult = await pool
      .request()
      .input("languageId", sql.Int, resolved)
      .query(`
        SELECT TOP 1 LANGUAGE, CULTURE_CODE
        FROM SYS_LANGUAGE
        WHERE LANGUAGE_ID = @languageId
      `);
    const row = langResult.recordset?.[0];
    languageName = row?.LANGUAGE || "";
    cultureCode = row?.CULTURE_CODE || "";
  } catch (err) {
    console.error(
      "[attributeTranslationService] language metadata lookup failed:",
      err?.message || err,
    );
  }

  const dict = await loadLanguage(resolved);
  /** @type {Record<string, { AttributeName: string, TranslatedAttribute: string, Language: string, CULTURECODE?: string }>} */
  const out = {};
  for (const [key, value] of dict.entries()) {
    out[key] = {
      AttributeName: key,
      TranslatedAttribute: value,
      Language: languageName,
      CULTURECODE: cultureCode,
    };
  }
  return {
    languageId: resolved,
    languageName,
    cultureCode,
    dictionary: out,
  };
}

/**
 * Resolve language by display name (legacy) or LANGUAGE_ID.
 * @param {{ languageId?: number|string, languageName?: string }} opts
 */
async function resolveLanguageId(opts = {}) {
  if (opts.languageId != null && opts.languageId !== "") {
    return normalizeLanguageId(opts.languageId);
  }
  const name = String(opts.languageName || "").trim();
  if (!name) return DEFAULT_LANGUAGE_ID;

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("language", sql.NVarChar, name)
      .query(`
        SELECT TOP 1 LANGUAGE_ID
        FROM SYS_LANGUAGE
        WHERE LANGUAGE = @language
      `);
    const id = result.recordset?.[0]?.LANGUAGE_ID;
    if (id != null) return normalizeLanguageId(id);
  } catch (err) {
    console.error(
      "[attributeTranslationService] resolveLanguageId failed:",
      err?.message || err,
    );
  }
  return DEFAULT_LANGUAGE_ID;
}

function invalidate(languageId) {
  if (languageId == null || languageId === "") {
    cacheByLanguageId.clear();
    inflightLoads.clear();
    return;
  }
  const resolved = normalizeLanguageId(languageId);
  cacheByLanguageId.delete(resolved);
  inflightLoads.delete(resolved);
}

/**
 * Warm English (and optionally another language) on application startup.
 */
async function warmCache(languageIds = [DEFAULT_LANGUAGE_ID]) {
  const ids = Array.from(
    new Set(
      (languageIds || [DEFAULT_LANGUAGE_ID]).map((id) =>
        normalizeLanguageId(id),
      ),
    ),
  );
  for (const id of ids) {
    try {
      const dict = await loadLanguage(id);
      console.log(
        `[attributeTranslationService] warmed LANGUAGE_ID=${id} (${dict.size} keys)`,
      );
    } catch (err) {
      console.error(
        `[attributeTranslationService] warmCache failed for ${id}:`,
        err?.message || err,
      );
    }
  }
}

function isLanguageCached(languageId) {
  return cacheByLanguageId.has(normalizeLanguageId(languageId));
}

module.exports = {
  DEFAULT_LANGUAGE_ID,
  loadLanguage,
  getText,
  getTextCached,
  getDictionary,
  getVisitorQuestionValues,
  getUiTranslationDict,
  resolveLanguageId,
  invalidate,
  warmCache,
  isLanguageCached,
};
