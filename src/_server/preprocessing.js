/**
 * preprocessing.js – Project 2
 * Handles: data loading, cleaning, top-X filtering,
 *          k-means feature encoding, PageRank graph building.
 */

import { kmeans, DISTANCE_METRICS } from './kmeans.js';
import { pagerank } from './pagerank.js';

// ── 1. Load & clean raw data ─────────────────────────────────────────────────

/**
 * Clean one raw game record.
 * Returns null if the record is irrecoverable.
 */
function cleanGame(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = Number(raw.id);
  if (!isFinite(id)) return null;

  const title = String(raw.title || '').trim() || `Game_${id}`;
  const year = Number(raw.year);
  const rank = Number(raw.rank);

  // Numeric fields – fallback to median-friendly defaults
  const minplayers = Number(raw.minplayers) || 1;
  const maxplayers = Number(raw.maxplayers) || minplayers;
  const minplaytime = Number(raw.minplaytime) || 30;
  const maxplaytime = Number(raw.maxplaytime) || minplaytime;
  const minage = Number(raw.minage) || 10;

  // Rating
  const ratingObj = raw.rating || {};
  const rating_value = Number(ratingObj.rating) || 0;
  const num_reviews = Number(ratingObj.num_of_reviews) || 0;

  // Derived
  const playtime_avg = (minplaytime + maxplaytime) / 2;
  const players_avg = (minplayers + maxplayers) / 2;

  // Types
  const categories = Array.isArray(raw.types?.categories)
    ? raw.types.categories.filter(c => c && c.name).map(c => c.name)
    : [];
  const mechanics = Array.isArray(raw.types?.mechanics)
    ? raw.types.mechanics.filter(m => m && m.name).map(m => m.name)
    : [];
  const num_mechanics = mechanics.length;

  const category_primary = categories[0] || 'Other';

  // Designers
  const designers = Array.isArray(raw.credit?.designer)
    ? raw.credit.designer.filter(d => d && d.name).map(d => d.name)
    : [];

  // Recommendations (fans_liked) – array of IDs
  const fans_liked = Array.isArray(raw.recommendations?.fans_liked)
    ? raw.recommendations.fans_liked.map(Number).filter(isFinite)
    : [];

  return {
    id, title, year: isFinite(year) ? year : null, rank: isFinite(rank) ? rank : 9999,
    minplayers, maxplayers, minplaytime, maxplaytime, minage,
    rating_value, num_reviews, playtime_avg, players_avg,
    categories, mechanics, num_mechanics, category_primary,
    designers, fans_liked,
  };
}

/**
 * Load and clean the dataset.
 * @param {Array}  rawData   – parsed JSON array
 * @param {number} topX      – keep only top-X by rank
 * @returns {{ games: Array, issues: Array }}
 */
export function loadAndClean(rawData, topX = 100) {
  const issues = [];
  const cleaned = [];

  for (const raw of rawData) {
    const g = cleanGame(raw);
    if (!g) {
      issues.push({ type: 'invalid_record', raw });
      continue;
    }
    // Flag specific issues for reporting
    if (!raw.year || !isFinite(Number(raw.year)))
      issues.push({ type: 'missing_year', id: g.id, title: g.title });
    if (g.minplaytime <= 0 || g.maxplaytime <= 0)
      issues.push({ type: 'invalid_playtime', id: g.id, title: g.title });
    if (g.rating_value === 0)
      issues.push({ type: 'missing_rating', id: g.id, title: g.title });
    if (g.categories.length === 0)
      issues.push({ type: 'missing_categories', id: g.id, title: g.title });

    cleaned.push(g);
  }

  // Sort by rank, take topX
  cleaned.sort((a, b) => a.rank - b.rank);
  const games = cleaned.slice(0, topX);

  return { games, issues };
}

// ── 2. Derive top categories & colour palette ─────────────────────────────────

export function getTopCategories(games, n = 10) {
  const freq = {};
  for (const g of games)
    for (const c of g.categories)
      freq[c] = (freq[c] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

// ── 3. K-Means feature encoding ───────────────────────────────────────────────

/**
 * All unique categories/mechanics found in the games.
 */
function collectVocabulary(games) {
  const cats = new Set(), mechs = new Set();
  for (const g of games) {
    for (const c of g.categories) cats.add(c);
    for (const m of g.mechanics) mechs.add(m);
  }
  return {
    categories: [...cats].sort(),
    mechanics: [...mechs].sort(),
  };
}

/**
 * Normalise a single numeric value to [0,1].
 */
function norm(val, min, max) {
  return max === min ? 0 : (val - min) / (max - min);
}

/**
 * Encode games for k-means.
 * Features:
 *   0  rating_value      (numeric, normalised)
 *   1  playtime_avg      (numeric, normalised)
 *   2  num_mechanics     (numeric, normalised)
 *   3  minage            (numeric, normalised)
 *   4  players_avg       (numeric, normalised)
 *   5  num_reviews_log   (log-scaled, normalised)
 *   6+ one-hot for top-8 categories
 *
 * Categorical fields encoded as binary (0/1) one-hot so distance metrics
 * treat them equally to scaled numeric dimensions.
 *
 * @param {Array}  games
 * @param {string} metric  – distance metric name (informational only here)
 * @returns {{ vectors: number[][], featureNames: string[], vocab: Object }}
 */
export function encodeForKMeans(games) {
  if (games.length === 0) return { vectors: [], featureNames: [], vocab: {} };

  // Collect ranges for normalisation
  const fields = ['rating_value', 'playtime_avg', 'num_mechanics', 'minage', 'players_avg'];
  const mins = {}, maxs = {};
  for (const f of fields) {
    mins[f] = Math.min(...games.map(g => g[f]));
    maxs[f] = Math.max(...games.map(g => g[f]));
  }
  const logReviews = games.map(g => Math.log10(g.num_reviews + 1));
  const minLR = Math.min(...logReviews), maxLR = Math.max(...logReviews);

  // Top 8 categories for one-hot
  const catFreq = {};
  for (const g of games) for (const c of g.categories) catFreq[c] = (catFreq[c] || 0) + 1;
  const top8cats = Object.entries(catFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

  const featureNames = [
    'Rating', 'Playtime', '#Mechanics', 'Min Age', 'Players', 'log(Reviews)',
    ...top8cats.map(c => `cat:${c}`),
  ];

  const vectors = games.map((g, gi) => {
    const numeric = [
      norm(g.rating_value, mins.rating_value, maxs.rating_value),
      norm(g.playtime_avg, mins.playtime_avg, maxs.playtime_avg),
      norm(g.num_mechanics, mins.num_mechanics, maxs.num_mechanics),
      norm(g.minage, mins.minage, maxs.minage),
      norm(g.players_avg, mins.players_avg, maxs.players_avg),
      norm(logReviews[gi], minLR, maxLR),
    ];
    const onehot = top8cats.map(c => g.categories.includes(c) ? 1 : 0);
    return [...numeric, ...onehot];
  });

  return { vectors, featureNames };
}

// ── 4. Run k-means and build cluster data ────────────────────────────────────

/**
 * @param {Array}  games
 * @param {number} k
 * @param {string} metric  – 'euclidean' | 'manhattan' | 'chebyshev'
 * @returns cluster-annotated game list + centroid info
 */
export function runKMeans(games, k = 5, metric = 'euclidean') {
  const { vectors, featureNames } = encodeForKMeans(games);
  if (vectors.length === 0) return { cluster_games: [], cluster_centroids: [], featureNames };

  const { labels, centroids, iterations } = kmeans(vectors, k, metric);

  const cluster_games = games.map((g, i) => ({
    ...g,
    cluster: labels[i],
    vector: vectors[i],
  }));

  // Per-cluster stats
  const cluster_centroids = centroids.map((c, ci) => {
    const members = cluster_games.filter(g => g.cluster === ci);
    return {
      id: ci,
      size: members.length,
      centroid: c,
      avg_rating: members.reduce((s, g) => s + g.rating_value, 0) / (members.length || 1),
      avg_playtime: members.reduce((s, g) => s + g.playtime_avg, 0) / (members.length || 1),
      avg_mechanics: members.reduce((s, g) => s + g.num_mechanics, 0) / (members.length || 1),
      top_category: (() => {
        const f = {};
        for (const g of members) f[g.category_primary] = (f[g.category_primary] || 0) + 1;
        return Object.entries(f).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
      })(),
    };
  });

  return { cluster_games, cluster_centroids, featureNames, iterations };
}

// ── 5. PageRank graph ────────────────────────────────────────────────────────

/**
 * Build a recommendation graph from fans_liked edges (within the dataset).
 * Run PageRank and return scores + edges.
 *
 * @param {Array}  games
 * @returns {{ pr_scores, pr_nodes, pr_edges, top_games }}
 */
export function buildPageRankGraph(games) {
  const ids = new Set(games.map(g => String(g.id)));

  // Adjacency: gameId -> [gameId] (only within dataset)
  const graph = {};
  const edgeSet = [];
  for (const g of games) {
    const src = String(g.id);
    graph[src] = [];
    for (const fl of g.fans_liked) {
      const dst = String(fl);
      if (ids.has(dst) && dst !== src) {
        graph[src].push(dst);
        edgeSet.push({ source: src, target: dst });
      }
    }
  }

  const pr_scores = pagerank(graph);

  // Normalise scores to [0,1]
  const vals = Object.values(pr_scores);
  const minPR = Math.min(...vals), maxPR = Math.max(...vals);
  const normPR = {};
  for (const [k, v] of Object.entries(pr_scores))
    normPR[k] = maxPR === minPR ? 0.5 : (v - minPR) / (maxPR - minPR);

  const gameById = {};
  for (const g of games) gameById[String(g.id)] = g;

  const pr_nodes = games.map(g => ({
    id: String(g.id),
    title: g.title,
    pr_score: pr_scores[String(g.id)] || 0,
    pr_norm: normPR[String(g.id)] || 0,
    rating_value: g.rating_value,
    category_primary: g.category_primary,
    categories: g.categories,
    mechanics: g.mechanics,
    num_mechanics: g.num_mechanics,
    playtime_avg: g.playtime_avg,
    minage: g.minage,
    year: g.year,
    rank: g.rank,
    out_degree: graph[String(g.id)]?.length || 0,
  }));

  // Top-10 most significant games
  const top_games = [...pr_nodes]
    .sort((a, b) => b.pr_score - a.pr_score)
    .slice(0, 10);

  return {
    pr_scores,
    pr_nodes,
    pr_edges: edgeSet,
    top_games,
  };
}

// ── 6. Project-1 preprocessing (kept for linked views) ─────────────────────

export function buildBubbleData(games) {
  return games.map(g => ({
    id: g.id, title: g.title,
    x: g.playtime_avg, y: g.rating_value,
    size: g.num_mechanics,
    category: g.category_primary,
    rank: g.rank,
  }));
}

export function buildPCData(games) {
  return games.map(g => ({
    id: g.id, title: g.title,
    rating: g.rating_value,
    playtime: g.playtime_avg,
    minplayers: g.minplayers,
    maxplayers: g.maxplayers,
    minage: g.minage,
    mechanics: g.num_mechanics,
    category: g.category_primary,
  }));
}

export function buildChordData(games, topMechs = 8) {
  // Frequency of mechanics
  const mechFreq = {};
  for (const g of games)
    for (const m of g.mechanics)
      mechFreq[m] = (mechFreq[m] || 0) + 1;

  const topMechNames = Object.entries(mechFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topMechs)
    .map(e => e[0]);

  // Co-occurrence: category x mechanic
  const edges = [];
  for (const g of games)
    for (const m of g.mechanics)
      if (topMechNames.includes(m))
        edges.push({ category: g.category_primary, mechanic: m, game_id: g.id });

  return { edges, top_mechanics: topMechNames };
}
