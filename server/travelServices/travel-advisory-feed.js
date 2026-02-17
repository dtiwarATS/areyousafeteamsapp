/**
 * U.S. Department of State Travel Advisory RSS feed – standalone module.
 * Copy this file into your project and use from a route.
 *
 * Install dependency in your project:  npm install rss-parser
 *
 * Usage:
 *   const travelAdvisory = require('./travel-advisory-feed');
 *   // In a route:
 *   const advisories = await travelAdvisory.getProcessedAdvisories();
 *   // Or raw feed + items:
 *   const { feed, items } = await travelAdvisory.getRawFeed();
 */

const Parser = require('rss-parser');

const RSS_URL = 'https://travel.state.gov/_res/rss/TAsTWs.xml';

// Fallback only: feed's dcIdentifier (e.g. "AM,advisory") is used first when present.
// Extend via setCountryCodeFallback() or pass countryCodeMap to getProcessedAdvisories().
const DEFAULT_COUNTRY_TO_CODE = {
  Afghanistan: 'AF', Albania: 'AL', Algeria: 'DZ', Argentina: 'AR', Armenia: 'AM',
  Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Bahamas: 'BS', Bahrain: 'BH',
  Bangladesh: 'BD', Barbados: 'BB', Belarus: 'BY', Belgium: 'BE', Belize: 'BZ',
  Benin: 'BJ', Bhutan: 'BT', Bolivia: 'BO', Botswana: 'BW', Brazil: 'BR',
  Brunei: 'BN', Bulgaria: 'BG', 'Burkina Faso': 'BF', Burundi: 'BI', 'Cabo Verde': 'CV',
  Cambodia: 'KH', Cameroon: 'CM', Canada: 'CA', 'Central African Republic': 'CF',
  Chad: 'TD', Chile: 'CL', China: 'CN', Colombia: 'CO', Comoros: 'KM', Congo: 'CG',
  'Costa Rica': 'CR', "Cote d'Ivoire": 'CI', Croatia: 'HR', Cuba: 'CU', Cyprus: 'CY',
  'Czech Republic': 'CZ', Czechia: 'CZ', 'Democratic Republic of the Congo': 'CD',
  Denmark: 'DK', Djibouti: 'DJ', 'Dominican Republic': 'DO', Ecuador: 'EC', Egypt: 'EG',
  'El Salvador': 'SV', 'Equatorial Guinea': 'GQ', Eritrea: 'ER', Estonia: 'EE',
  Eswatini: 'SZ', Ethiopia: 'ET', Fiji: 'FJ', Finland: 'FI', France: 'FR', Gabon: 'GA',
  Gambia: 'GM', Georgia: 'GE', Germany: 'DE', Ghana: 'GH', Greece: 'GR', Guatemala: 'GT',
  Guinea: 'GN', 'Guinea-Bissau': 'GW', Guyana: 'GY', Haiti: 'HT', Honduras: 'HN',
  Hungary: 'HU', Iceland: 'IS', India: 'IN', Indonesia: 'ID', Iran: 'IR', Iraq: 'IQ',
  Ireland: 'IE', Israel: 'IL', Italy: 'IT', Jamaica: 'JM', Japan: 'JP', Jordan: 'JO',
  Kazakhstan: 'KZ', Kenya: 'KE', Kiribati: 'KI', Kosovo: 'XK', Kuwait: 'KW',
  Kyrgyzstan: 'KG', Laos: 'LA', Latvia: 'LV', Lebanon: 'LB', Lesotho: 'LS', Liberia: 'LR',
  Libya: 'LY', Liechtenstein: 'LI', Lithuania: 'LT', Luxembourg: 'LU', Madagascar: 'MG',
  Malawi: 'MW', Malaysia: 'MY', Maldives: 'MV', Mali: 'ML', Malta: 'MT',
  'Marshall Islands': 'MH', Mauritania: 'MR', Mauritius: 'MU', Mexico: 'MX',
  Micronesia: 'FM', 'Federated States of Micronesia': 'FM', Moldova: 'MD', Monaco: 'MC',
  Mongolia: 'MN', Montenegro: 'ME', Morocco: 'MA', Mozambique: 'MZ', Myanmar: 'MM',
  Namibia: 'NA', Nauru: 'NR', Nepal: 'NP', Netherlands: 'NL', 'New Caledonia': 'NC',
  'New Zealand': 'NZ', Nicaragua: 'NI', Niger: 'NE', Nigeria: 'NG', 'North Korea': 'KP',
  'North Macedonia': 'MK', Norway: 'NO', Oman: 'OM', Pakistan: 'PK', Palau: 'PW',
  Panama: 'PA', 'Papua New Guinea': 'PG', Paraguay: 'PY', Peru: 'PE', Philippines: 'PH',
  Poland: 'PL', Portugal: 'PT', Qatar: 'QA', Romania: 'RO', Russia: 'RU', Rwanda: 'RW',
  'Saint Kitts and Nevis': 'KN', 'Saint Lucia': 'LC', 'Saint Vincent and the Grenadines': 'VC',
  Samoa: 'WS', 'San Marino': 'SM', 'Sao Tome and Principe': 'ST', 'Saudi Arabia': 'SA',
  Senegal: 'SN', Serbia: 'RS', Seychelles: 'SC', 'Sierra Leone': 'SL', Singapore: 'SG',
  Slovakia: 'SK', Slovenia: 'SI', 'Solomon Islands': 'SB', Somalia: 'SO', 'South Africa': 'ZA',
  'South Korea': 'KR', 'South Sudan': 'SS', Spain: 'ES', 'Sri Lanka': 'LK', Sudan: 'SD',
  Suriname: 'SR', Sweden: 'SE', Switzerland: 'CH', Syria: 'SY', Taiwan: 'TW', Tajikistan: 'TJ',
  Tanzania: 'TZ', Thailand: 'TH', 'Timor-Leste': 'TL', Togo: 'TG', Tonga: 'TO',
  'Trinidad and Tobago': 'TT', Tunisia: 'TN', Turkey: 'TR', Turkmenistan: 'TM', Tuvalu: 'TV',
  Uganda: 'UG', Ukraine: 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
  'United States': 'US', Uruguay: 'UY', Uzbekistan: 'UZ', Vanuatu: 'VU', 'Vatican City': 'VA',
  Venezuela: 'VE', Vietnam: 'VN', Yemen: 'YE', Zambia: 'ZM', Zimbabwe: 'ZW', Greenland: 'GL'
};

let countryCodeFallbackMap = { ...DEFAULT_COUNTRY_TO_CODE };

const parser = new Parser({
  customFields: {
    item: [
      ['category', 'categories', { keepArray: true }],
      ['dc:identifier', 'dcIdentifier']
    ]
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; TravelAdvisoryBot/1.0; +https://travel.state.gov/content/travel/en/rss.html)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*'
  }
});

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[#\w]+;/g, ' ').trim();
}

function parseCategories(categories) {
  const result = { threatLevel: '', countryTag: '', keywords: [] };
  if (!Array.isArray(categories)) return result;
  categories.forEach((cat) => {
    const category = typeof cat === 'string' ? { domain: 'Keyword', _: cat } : cat;
    const domain = (category.$ && category.$.domain) || category.domain;
    const text = category._ || category.text || '';
    if (domain === 'Threat-Level') result.threatLevel = text;
    else if (domain === 'Country-Tag') result.countryTag = text;
    else if (domain === 'Keyword') result.keywords.push(text);
  });
  return result;
}

function countryToCode(country) {
  const normalized = (country || '').toLowerCase().trim();
  for (const [name, code] of Object.entries(countryCodeFallbackMap)) {
    if (name.toLowerCase() === normalized) return code;
  }
  return 'XX';
}

/** Prefer feed's dcIdentifier (e.g. "AM,advisory" → "AM"); fall back to name lookup. */
function getCountryCodeFromItem(item, countryName) {
  const raw = item.dcIdentifier || item.dcidentifier;
  if (raw && typeof raw === 'string') {
    const code = raw.split(',')[0].trim().toUpperCase();
    if (code.length === 2) return code;
  }
  return countryToCode(countryName);
}

function extractCountryInfo(title) {
  const match = title.match(/^(.+?)\s*-\s*Level\s+\d+:/);
  if (match) {
    const country = match[1].trim();
    return { country };
  }
  const fallback = title.match(/^([^-\n]+)/);
  if (fallback) {
    const country = fallback[1].trim();
    return { country };
  }
  return { country: title };
}

function extractThreatLevel(level) {
  const match = (level || '').match(/Level (\d+)/);
  const levelNumber = match ? parseInt(match[1], 10) : 0;
  return { level: level || 'Unknown', levelNumber };
}

function parseDescription(description) {
  const restrictions = [];
  const recommendations = [];
  if (!description || typeof description !== 'string') return { restrictions, recommendations };
  try {
    const doNotTravelMatch = description.match(/<b>Do Not Travel To These Areas for Any Reason:<\/b>(.*?)<\/ul>/s);
    if (doNotTravelMatch) {
      const listItems = doNotTravelMatch[1].match(/<li>(.*?)<\/li>/g);
      if (listItems) restrictions.push(...listItems.map((item) => stripHtml(item)));
    }
    const embassyMatch = description.match(/<p>U\.S\. Embassy employees.*?<\/p>(.*?)(?=<p>|$)/s);
    if (embassyMatch) {
      const listItems = embassyMatch[1].match(/<li>(.*?)<\/li>/g);
      if (listItems) restrictions.push(...listItems.map((item) => stripHtml(item)));
    }
    const recommendationMatches = description.match(/<ul>(.*?)<\/ul>/gs);
    if (recommendationMatches) {
      recommendationMatches.forEach((match) => {
        const listItems = match.match(/<li>(.*?)<\/li>/g);
        if (listItems) recommendations.push(...listItems.map((item) => stripHtml(item)));
      });
    }
  } catch (e) {
    // ignore
  }
  return { restrictions, recommendations };
}

function extractSummary(description) {
  if (!description || typeof description !== 'string') return 'No summary available';
  try {
    const summaryMatch = description.match(/<b>Country Summary:<\/b>(.*?)<\/p>/s);
    if (summaryMatch) return stripHtml(summaryMatch[1]).trim();
    const firstParagraph = description.match(/<p>(.*?)<\/p>/s);
    if (firstParagraph) return stripHtml(firstParagraph[1]).trim();
  } catch (e) {
    // ignore
  }
  return 'No summary available';
}

function cleanHtmlDescription(description) {
  if (!description || typeof description !== 'string') return '';
  return stripHtml(description).replace(/\s+/g, ' ').trim();
}

function generateId(guid) {
  if (!guid || typeof guid !== 'string') return 'unknown_' + Date.now().toString().slice(-8);
  try {
    return Buffer.from(guid).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  } catch (e) {
    return 'error_' + Date.now().toString().slice(-8);
  }
}

function processAdvisoryItem(item, options) {
  const categories = parseCategories(item.categories || []);
  const { country } = extractCountryInfo(item.title || '');
  const countryCode = (options && options.countryCodeMap)
    ? (options.countryCodeMap[country] || countryToCode(country))
    : getCountryCodeFromItem(item, country);
  const { level, levelNumber } = extractThreatLevel(categories.threatLevel);
  const { restrictions, recommendations } = parseDescription(item.description || '');

  return {
    id: generateId(item.guid),
    country,
    countryCode,
    title: item.title,
    level: categories.threatLevel || 'Unknown',
    levelNumber,
    link: item.link,
    pubDate: item.pubDate,
    description: cleanHtmlDescription(item.description),
    summary: extractSummary(item.description),
    restrictions,
    recommendations,
    lastUpdated: new Date(item.pubDate || 0)
  };
}

/**
 * Fetches the RSS feed from travel.state.gov and returns raw feed + items.
 * Use this if you want the raw structure or to process items yourself.
 *
 * @returns {Promise<{ feed: object, items: array }>}
 */
async function getRawFeed() {
  const feed = await parser.parseURL(RSS_URL);
  const items = Array.isArray(feed.items) ? feed.items : [];
  return {
    feed: {
      title: feed.title || 'Travel Advisories',
      link: feed.link || 'https://travel.state.gov',
      description: feed.description || 'Travel Advisories from U.S. Department of State',
      pubDate: feed.pubDate || new Date().toISOString(),
      items
    },
    items
  };
}

/**
 * Fetches the RSS feed and returns an array of processed travel advisories
 * (country, countryCode, level, levelNumber, summary, restrictions, recommendations, etc.).
 * Use this from your route for a ready-to-send JSON response.
 *
 * @param {Object} [options]
 * @param {Object} [options.countryCodeMap] - Override/extension for country name → ISO code (e.g. { 'New Country': 'NC' })
 * @returns {Promise<Array>} Processed advisories
 */
async function getProcessedAdvisories(options) {
  const { items } = await getRawFeed();
  return items.map((item) => processAdvisoryItem(item, options));
}

/**
 * Set or extend the fallback map used when the feed has no dcIdentifier for a country.
 * Call with a new object to replace, or with { ...travelAdvisory.getCountryCodeFallback(), 'Newland': 'NL' } to extend.
 *
 * @param {Object} map - Country name → ISO 2-letter code
 */
function setCountryCodeFallback(map) {
  countryCodeFallbackMap = map && typeof map === 'object' ? { ...map } : { ...DEFAULT_COUNTRY_TO_CODE };
}

/** Get the current fallback map (for extending or debugging). */
function getCountryCodeFallback() {
  return { ...countryCodeFallbackMap };
}

module.exports = {
  getRawFeed,
  getProcessedAdvisories,
  setCountryCodeFallback,
  getCountryCodeFallback,
  getCountryCodeFromItem,
  RSS_URL,
  processAdvisoryItem,
  parseCategories,
  extractCountryInfo,
  extractThreatLevel,
  parseDescription,
  extractSummary,
  countryToCode,
  stripHtml,
  cleanHtmlDescription,
  generateId
};
