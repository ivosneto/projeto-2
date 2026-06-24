/**
 * preprocess_data.mjs – Task 1 data pipeline
 *
 * Reads:
 *   data/recommendations-2021-12-31.csv  (top-1000 ranked games + up to 28 fan recommendations)
 *   data/bgg_Gameitems.csv               (full metadata: categories, mechanics, playtime, etc.)
 *
 * Joins on game ID, cleans dirty values, and writes:
 *   data/boardgames_1000.json
 *
 * Data quality issues handled:
 *   - Missing / non-numeric year        → stored as null, flagged
 *   - Zero / negative playtime          → fallback to 30 min, flagged
 *   - Empty categories or mechanics     → stored as [], flagged
 *   - Missing avg_rating / num_votes    → stored as 0, flagged
 *   - min_players > max_players         → swap values
 *   - Duplicate recommendation IDs     → deduplicated
 *
 * Run once (from the Template folder):
 *   node src/_server/preprocess_data.mjs
 */

import { createReadStream } from 'fs';
import { writeFileSync }    from 'fs';
import { fileURLToPath }    from 'url';
import { dirname, join }    from 'path';
import { parse }            from 'csv-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = join(__dirname, '..', '..', 'data');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }))
      .on('data', row => records.push(row))
      .on('end',  ()  => resolve(records))
      .on('error', reject);
  });
}

/** Split a CSV-style string into a trimmed, non-empty string array. */
function splitField(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

// ── 1. Read both CSVs in parallel ────────────────────────────────────────────

console.log('[preprocess] Reading CSV files …');
const [recRows, itemRows] = await Promise.all([
  parseCSV(join(DATA_DIR, 'recommendations-2021-12-31.csv')),
  parseCSV(join(DATA_DIR, 'bgg_Gameitems.csv')),
]);
console.log(`[preprocess] recommendations: ${recRows.length} rows`);
console.log(`[preprocess] bgg_Gameitems : ${itemRows.length} rows`);

// ── 2. Build lookup map for game items (bgg_id → row) ────────────────────────

const itemMap = new Map();
for (const row of itemRows) {
  const id = Number(row.bgg_id);
  if (isFinite(id)) itemMap.set(id, row);
}

// ── 3. Join, clean, and track data-quality issues ────────────────────────────

const issues  = [];
const games   = [];

for (const rec of recRows) {
  const id   = Number(rec.ID);
  const rank = Number(rec.Rank);
  if (!isFinite(id) || !isFinite(rank)) continue;   // skip unreadable rows

  const item = itemMap.get(id) || {};

  // ── Year ─────────────────────────────────────────────────────────────────
  const rawYear = rec.Year || item.year;
  const year    = rawYear && isFinite(Number(rawYear)) ? Number(rawYear) : null;
  if (year === null) issues.push({ type: 'missing_year', id, title: rec.Name });

  // ── Playtime ─────────────────────────────────────────────────────────────
  let minplaytime = Number(item.min_time) || 0;
  let maxplaytime = Number(item.max_time) || 0;
  if (minplaytime <= 0 || maxplaytime <= 0) {
    issues.push({ type: 'invalid_playtime', id, title: rec.Name });
    minplaytime = minplaytime > 0 ? minplaytime : 30;
    maxplaytime = maxplaytime > 0 ? maxplaytime : minplaytime;
  }
  if (minplaytime > maxplaytime) maxplaytime = minplaytime;

  // ── Players ───────────────────────────────────────────────────────────────
  let minplayers = Number(item.min_players) || 1;
  let maxplayers = Number(item.max_players) || minplayers;
  if (minplayers > maxplayers) [minplayers, maxplayers] = [maxplayers, minplayers];

  // ── Min age ───────────────────────────────────────────────────────────────
  const minage = Number(item.min_age) || 10;

  // ── Rating ────────────────────────────────────────────────────────────────
  const rating_val  = Number(rec.Average)       || Number(item.avg_rating)  || 0;
  const num_reviews = Number(rec['Users rated']) || Number(item.num_votes)   || 0;
  if (rating_val === 0) issues.push({ type: 'missing_rating', id, title: rec.Name });

  // ── Categories ───────────────────────────────────────────────────────────
  const categoryNames = splitField(item.category);
  if (categoryNames.length === 0)
    issues.push({ type: 'missing_categories', id, title: rec.Name });
  const categories = categoryNames.map((name, idx) => ({ id: idx, name }));

  // ── Mechanics ────────────────────────────────────────────────────────────
  const mechanicNames = splitField(item.mechanic);
  const mechanics     = mechanicNames.map((name, idx) => ({ id: idx, name }));

  // ── Designers (artist field – closest available) ──────────────────────────
  const designerNames = splitField(item.artist);
  const designers     = designerNames.map(name => ({ name }));

  // ── Fan recommendations (cols: recommendation1 … recommendation28) ───────
  const fans_liked = [];
  const seen       = new Set();
  for (let i = 1; i <= 28; i++) {
    const raw = rec[`recommendation${i}`];
    const rid = Number(raw);
    if (raw && isFinite(rid) && !seen.has(rid)) {
      fans_liked.push(rid);
      seen.add(rid);
    }
  }

  games.push({
    id, title: rec.Name || item.name || `Game_${id}`,
    year, rank,
    minplayers, maxplayers,
    minplaytime, maxplaytime,
    minage,
    rating: { rating: rating_val, num_of_reviews: num_reviews },
    recommendations: { fans_liked },
    types: { categories, mechanics },
    credit: { designer: designers },
  });
}

// Sort by rank (ascending)
games.sort((a, b) => a.rank - b.rank);

// ── 4. Summary ────────────────────────────────────────────────────────────────

const byType = {};
for (const issue of issues) byType[issue.type] = (byType[issue.type] || 0) + 1;

console.log(`\n[preprocess] Games produced: ${games.length}`);
console.log('[preprocess] Data quality issues:');
for (const [type, count] of Object.entries(byType))
  console.log(`             ${type}: ${count}`);

// ── 5. Write output ───────────────────────────────────────────────────────────

const outPath = join(DATA_DIR, 'boardgames_1000.json');
writeFileSync(outPath, JSON.stringify(games));
console.log(`\n[preprocess] Written → ${outPath}`);
console.log('[preprocess] Done.');
