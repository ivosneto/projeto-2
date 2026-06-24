/**
 * server.js – Project 2 main entry point
 * Serves static files (port 3000) and WebSocket (port 3231).
 *
 * Run with: npm run dev-server  (uses babel-node for ES modules)
 *       or: npm run dev         (concurrently with webpack)
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  loadAndClean,
  getTopCategories,
  runKMeans,
  buildPageRankGraph,
  buildBubbleData,
  buildPCData,
  buildChordData,
} from '../preprocessing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_PATH = join(__dirname, '..', '..', '..', 'data', 'boardgames_1000.json');

// ── Load raw data once ────────────────────────────────────────────────────────
let rawData = [];
try {
  rawData = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  console.log(`[server] Loaded ${rawData.length} raw game records.`);
} catch (e) {
  console.error('[server] ERROR reading data file:', e.message);
  console.error('         Make sure data/boardgames_100.json exists.');
}

// ── Core computation ──────────────────────────────────────────────────────────
function computePayload(params = {}) {
  const topX   = Math.max(10,  Math.min(1000, Number(params.topX)   || 100));
  const k      = Math.max(2,   Math.min(20,   Number(params.k)      || 5));
  const metric = ['euclidean', 'manhattan', 'chebyshev'].includes(params.metric)
    ? params.metric : 'euclidean';

  // ── Task 1: Load & clean ──────────────────────────────────────────────────
  const { games, issues } = loadAndClean(rawData, topX);
  const top_categories    = getTopCategories(games, 12);

  const issues_summary = {
    total:            issues.length,
    missing_year:     issues.filter(i => i.type === 'missing_year').length,
    invalid_playtime: issues.filter(i => i.type === 'invalid_playtime').length,
    missing_rating:   issues.filter(i => i.type === 'missing_rating').length,
    missing_category: issues.filter(i => i.type === 'missing_categories').length,
  };

  // ── Task 2: K-Means ───────────────────────────────────────────────────────
  const {
    cluster_games,
    cluster_centroids,
    featureNames,
    iterations: km_iterations,
  } = runKMeans(games, k, metric);

  // ── Task 3: PageRank graph ────────────────────────────────────────────────
  const { pr_nodes, pr_edges, top_games } = buildPageRankGraph(games);

  // ── Project 1 views ───────────────────────────────────────────────────────
  const bubble_data = buildBubbleData(games);
  const pc_data     = buildPCData(games);
  const { edges: chord_edges, top_mechanics } = buildChordData(games);

  return {
    params:          { topX, k, metric },
    games,
    top_categories,
    issues_summary,
    // Task 2
    cluster_games,
    cluster_centroids,
    featureNames,
    km_params:       { k, metric, iterations: km_iterations },
    // Task 3
    pr_nodes,
    pr_edges,
    top_games,
    // Project 1
    bubble_data,
    pc_data,
    chord_edges,
    top_mechanics,
  };
}

// ── Socket.IO server (port 3231) ──────────────────────────────────────────────
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', socket => {
  console.log(`[socket] ++ connected  : ${socket.id}`);

  // Send initial data with default params
  try {
    socket.emit('freshData', computePayload());
  } catch (e) {
    console.error('[socket] initial payload error:', e.message);
  }

  // Client requests recompute with new params (k, topX, metric)
  socket.on('requestData', (params = {}) => {
    console.log('[socket] requestData :', params);
    try {
      socket.emit('freshData', computePayload(params));
    } catch (e) {
      console.error('[socket] requestData error:', e.message);
      socket.emit('serverError', { message: e.message });
    }
  });

  socket.on('disconnect', () =>
    console.log(`[socket] -- disconnected: ${socket.id}`)
  );
});

httpServer.listen(3231, () =>
  console.log('[server] WebSocket     → ws://localhost:3231')
);
