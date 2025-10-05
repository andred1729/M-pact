// npm i axios cheerio
const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://impact.ese.ic.ac.uk/ImpactEarth/cgi-bin/crater.cgi";

const params = {
  dist: "1",          // distance from impact (km)
  diam: "1000",          // projectile diameter (m)
  pdens: "3000",       // projectile density (kg/m^3)
  pdens_select: "0",
  vel: "20",           // impact velocity (km/s)
  theta: "30",         // impact angle (deg)
  tdens: "1000",       // target density (kg/m^3)
  tdens_select: "0",
};

function buildUrl(base, params) {
  return base + "?" + new URLSearchParams(params).toString();
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (ImpactScraper/1.0)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://impact.ese.ic.ac.uk/ImpactEarth/",
    },
    timeout: 30000,
  });
  return data;
}

// --- helpers -------------------------------------------------------------

// Split an HTML fragment by <br> boundaries and return array of *HTML* pieces
function splitByBr(html) {
  if (!html) return [];
  // normalize different <br> forms, then split
  return html
    .replace(/<br[^>]*>/gi, "|||BR|||")
    .split("|||BR|||")
    .map(s => s.trim())
    .filter(Boolean);
}

// Convert a tiny HTML fragment to normalized *text*
function htmlToCleanText(fragment) {
  if (!fragment) return "";
  // Keep superscripts as ^n (e.g., 10^20), then strip tags
  const withCarats = fragment
    .replace(/<sup>(.*?)<\/sup>/gi, "^$1")
    .replace(/&nbsp;/gi, " ");
  // load into cheerio to drop tags but keep text content
  const $frag = cheerio.load(`<div>${withCarats}</div>`);
  const txt = $frag("div").text();
  return txt.replace(/\s+/g, " ").trim();
}

// Extract all <li> bullets inside a node
function extractBullets($, node) {
  const bullets = [];
  $(node).find("ul").each((_, ul) => {
    $(ul)
      .find("li")
      .each((__, li) => {
        const t = htmlToCleanText($(li).html() || $(li).text());
        if (t) bullets.push(t);
      });
  });
  return bullets;
}

// Extract cleaned “lines” from a <dd>, splitting on <br> when used as a list
function extractDdLines($, dd) {
  const raw = $(dd).html() || $(dd).text() || "";
  const parts = splitByBr(raw);
  if (parts.length === 0) {
    const t = htmlToCleanText(raw);
    return t ? [t] : [];
  }
  return parts
    .map(p => htmlToCleanText(p))
    .filter(Boolean);
}

// --- core parser ---------------------------------------------------------

function parseSections(html) {
  const $ = cheerio.load(html, { decodeEntities: true });

  const data = {};

  // Optional: capture the top notice paragraph (the uncertainty disclaimer)
  const notice = $("p").first().text().replace(/\s+/g, " ").trim();
  if (notice) data.notice = notice;

  // Each section is a <dl> with a <dt><h2>Title:</h2> and multiple <dd> items
  $("dl > dt > h2").each((_, h2) => {
    const title = $(h2).text().trim().replace(/:$/, "");
    const dl = $(h2).closest("dl");
    const section = [];

    // Iterate only the *direct* dd children of this dl (keeps sections clean)
    dl.children("dd").each((__, dd) => {
      const bullets = extractBullets($, dd);
      const lines = extractDdLines($, dd);

      // If we have true bullets, add as a { bullets } object
      if (bullets.length) section.push({ bullets });

      // Add any text lines present in this dd
      for (const line of lines) {
        // Skip empties or lone “What does this mean?” style anchors (already captured as text)
        if (line) section.push(line);
      }
    });

    // Normalize common “fake list” patterns like “X: <b>value</b>”
    // Nothing special to do here; the above already preserved them as text lines.

    data[title] = section;
  });

  // Post-process “Your Inputs” into key/value pairs when present
  if (data["Your Inputs"]) {
    const kv = {};
    for (const entry of data["Your Inputs"]) {
      if (typeof entry !== "string") continue;
      const idx = entry.indexOf(":");
      if (idx > -1) {
        const key = entry.slice(0, idx).trim();
        const val = entry.slice(idx + 1).trim();
        if (key) kv[key] = val;
      }
    }
    data["Your Inputs"] = kv;
  }

  return data;
}
// -------- helper: scientific "3.14 x 10^20" -> 3.14e20 --------------
function sciToNumber(s) {
  // Handles: "3.14 x 10^20", "7.35 x 10^4", also plain "722"
  s = s.replace(/,/g, "").trim();
  const sci = s.match(/^([+-]?\d*\.?\d+)\s*(?:x|\*\s*10\^?)\s*10\^?(-?\d+)$/i);
  if (sci) return Number(sci[1]) * Math.pow(10, Number(sci[2]));
  const plain = s.match(/^([+-]?\d*\.?\d+)(?:e([+-]?\d+))?$/i);
  if (plain) return Number(s);
  return NaN;
}

// -------- helper: extract all "number + unit" pairs from a string ----
function extractPairs(line) {
  // Examples to catch:
  // "3.14 x 10^20 Joules"
  // "7.50 x 10^4 MegaTons TNT"
  // "56600 meters = 186000 ft"
  // "19.8 km/s = 12.3 miles/s"
  // "2.56 km by 1.28 km"
  const pairs = [];

  // 1) split on "=" and " by " to separate alternative units / ellipse dims
  const chunks = line
    .split(/\s=\s|=| by /i)
    .map(s => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    // find first number-like token + trailing unit words/symbols
    // allow "x 10^n" form
    const m = chunk.match(/([+-]?\d*\.?\d+(?:\s*(?:x|\*\s*10\^?)\s*10\^?-?\d+)?)(.*)$/i);
    if (!m) continue;
    const numStr = m[1].trim();
    let unit = m[2].trim();

    // normalize units
    unit = unit
      .replace(/\(.*?\)/g, "")            // drop parenthetical duplicates
      .replace(/\s+per\s+/gi, "/")        // km per second -> km/second
      .replace(/\s+/g, " ")
      .trim();

    // shorten common units/labels
    unit = unit
      .replace(/\bMegaTons(?: TNT)?\b/i, "megatons")
      .replace(/\bJoules?\b/i, "J")
      .replace(/\bmeters?\b/i, "m")
      .replace(/\bkilometers?\b/i, "km")
      .replace(/\bmiles?\b/i, "miles")
      .replace(/\bfeet\b/i, "ft")
      .replace(/\byears?\b/i, "years")
      .replace(/\bkm\s*per\s*second\b/i, "km/s")
      .replace(/\bmiles\s*per\s*second\b/i, "miles/s")
      .replace(/\bkm\s*\/\s*second\b/i, "km/s")
      .replace(/\bmiles\s*\/\s*second\b/i, "miles/s")
      .replace(/\bkm3\b/i, "km3")
      .replace(/\bmiles3\b/i, "mi3")
      .replace(/\skg\/m\^?3/i, "kg/m3");

    const value = sciToNumber(numStr);
    if (!Number.isNaN(value)) {
      pairs.push({ value, unit: unit || null });
    }
  }

  // special case: if nothing matched but it looks like years alone (e.g., "6.2 x 10^5years")
  if (pairs.length === 0) {
    const z = line.match(/([+-]?\d*\.?\d+(?:\s*(?:x|\*\s*10\^?)\s*10\^?-?\d+)?)(?:\s*)years/i);
    if (z) {
      const value = sciToNumber(z[1]);
      if (!Number.isNaN(value)) pairs.push({ value, unit: "years" });
    }
  }
  return pairs;
}

// -------- helper: put {value,unit} into flat map under a base key ----
function putPair(obj, base, pair, idx = null) {
  // transform unit -> suffix
  let suffix = "";
  if (pair.unit) {
    suffix =
      "_" +
      pair.unit
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^\w/]/g, "")
        .replace(/\//g, "_per_");
  }
  const key = idx == null ? `${base}${suffix}` : `${base}_${idx}${suffix}`;
  obj[key] = pair.value;
}

// -------- main reducer: map verbose lines to simple keys --------------
function simplify(results) {
  const out = {};

  // --- Your Inputs (already key:value strings) ---
  if (results["Your Inputs"]) {
    // Optionally parse numbers inside inputs too, but keep the text as-is:
    for (const [k, v] of Object.entries(results["Your Inputs"])) {
      const key = k.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
      out[`input_${key}`] = v;
    }
  }

  const sections = results;

  // Utility to scan a section's lines against a set of matchers
  function scan(sectionName, matchers) {
    const lines = sections[sectionName] || [];
    for (const ln of lines) {
      if (typeof ln !== "string") continue;
      for (const m of matchers) {
        const hit = m.pattern.exec(ln);
        if (!hit) continue;
        const pairs = extractPairs(ln);

        if (m.custom) {
          m.custom(out, ln, hit, pairs);
        } else if (pairs.length) {
          // default: write all pairs as base_key[_idx][_unit]
          if (pairs.length === 1) putPair(out, m.base, pairs[0]);
          else pairs.forEach((p, i) => putPair(out, m.base, p, i + 1));
        }
        break; // stop after first matcher matches this line
      }
    }
  }

  // ---------------- ENERGY ----------------
  scan("Energy", [
    { pattern: /energy before atmospheric entry/i, base: "energy_before_entry" },
    {
      pattern: /average interval between impacts/i,
      custom: (o, line) => {
        const v = extractPairs(line).find(p => (p.unit || "").includes("years"));
        if (v) putPair(o, "avg_interval", v);
      },
    },
  ]);

  // ---------------- ATMOSPHERIC ENTRY ----------------
  scan("Atmospheric Entry", [
    { pattern: /begins to break.?up at an altitude/i, base: "breakup_altitude" },
    { pattern: /mass of projectile strikes .* velocity/i, base: "ground_velocity" },
    { pattern: /energy lost in the atmosphere/i, base: "energy_lost_atmosphere" },
    { pattern: /impact energy/i, base: "impact_energy" },
    {
      pattern: /ellipse of dimension/i,
      custom: (o, line) => {
        const ps = extractPairs(line).filter(p => (p.unit || "").toLowerCase() === "km");
        if (ps[0]) putPair(o, "fragment_ellipse_km_a", ps[0]);
        if (ps[1]) putPair(o, "fragment_ellipse_km_b", ps[1]);
      },
    },
  ]);

  // ---------------- CRATER DIMENSIONS ----------------
  scan("Crater Dimensions", [
    { pattern: /transient crater.*diameter/i, base: "transient_crater_diameter" },
    { pattern: /transient crater depth/i, base: "transient_crater_depth" },
    { pattern: /final crater.*diameter/i, base: "final_crater_diameter" },
    { pattern: /final crater depth/i, base: "final_crater_depth" },
    {
      pattern: /volume of the target melted or vaporized/i,
      base: "melt_volume",
    },
    {
      pattern: /average thickness/i,
      base: "avg_melt_thickness",
    },
  ]);

  // ---------------- EJECTA ----------------
  // (Example page just says position inside transient crater — no numeric pairs)

  return out;
}

// ------------------- usage -------------------
// After you have: const results = parseSections(html);
// do:
/// const flat = simplify(results);
// console.log(flat);


// --- runner --------------------------------------------------------------

(async () => {
  const url = buildUrl(BASE, params);
  const html = await fetchHtml(url);
  const results = parseSections(html);
  const flat = simplify(results);

  // Examples of using the parsed object:
  const $ = cheerio.load(html);
  console.log("Title:", $("title").text().trim(), "\n");

  // Dump everything as pretty JSON:
  console.log(JSON.stringify(flat, null, 2));

  // Or access specific sections:
  // console.log("Energy:", results["Energy"]);
  // console.log("Crater Dimensions:", results["Crater Dimensions"]);
})();
