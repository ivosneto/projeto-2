/**
 * websocket.js – Project 2 server
 * Reads boardgames_100.json, cleans data, runs k-means + PageRank,
 * and emits freshData to all connected clients.
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

// ── Data path ────────────────────────────────────────────────────────────────
const DATA_PATH = join(__dirname, '..', '..', '..', 'data', 'boardgames_1000.json');

let rawData = [];
try {
  rawData = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  console.log(`[server] Loaded ${rawData.length} raw games.`);
} catch (e) {
  console.error('[server] Could not read data file:', e.message);
}

// ── Compute everything given parameters ──────────────────────────────────────
function computePayload(params = {}) {
  const topX   = Math.max(10, Math.min(1000, Number(params.topX)   || 100));
  const k      = Math.max(2,  Math.min(20,   Number(params.k)      || 5));
  const metric = ['euclidean', 'manhattan', 'chebyshev'].includes(params.metric)
    ? params.metric : 'euclidean';

  const { games, issues } = loadAndClean(rawData, topX);
  const top_categories    = getTopCategories(games, 12);

  // K-Means (Task 2)
  const { cluster_games, cluster_centroids, featureNames, iterations: km_iters } =
    runKMeans(games, k, metric);

  // PageRank graph (Task 3)
  const { pr_nodes, pr_edges, top_games } = buildPageRankGraph(games);

  // Project-1 views
  const bubble_data = buildBubbleData(games);
  const pc_data     = buildPCData(games);
  const { edges: chord_edges, top_mechanics } = buildChordData(games);

  return {
    params: { topX, k, metric },
    games,
    top_categories,
    issues_summary: {
      total:           issues.length,
      missing_year:    issues.filter(i => i.type === 'missing_year').length,
      invalid_playtime:issues.filter(i => i.type === 'invalid_playtime').length,
      missing_rating:  issues.filter(i => i.type === 'missing_rating').length,
      missing_category:issues.filter(i => i.type === 'missing_categories').length,
    },
    // Task 2 – K-Means
    cluster_games,
    cluster_centroids,
    featureNames,
    km_params: { k, metric, iterations: km_iters },
    // Task 3 – PageRank
    pr_nodes,
    pr_edges,
    top_games,
    // Project-1
    bubble_data,
    pc_data,
    chord_edges,
    top_mechanics,
  };
}

// ── Socket.IO server ─────────────────────────────────────────────────────────
export function startWebsocketServer(port = 3231) {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', socket => {
    console.log(`[socket] client connected: ${socket.id}`);

    // Initial data with default params
    socket.emit('freshData', computePayload());

    // Client requests recompute with new params
    socket.on('requestData', (params = {}) => {
      console.log('[socket] requestData:', params);
      try {
        socket.emit('freshData', computePayload(params));
      } catch (e) {
        console.error('[socket] error computing payload:', e);
        socket.emit('error', { message: e.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`[server] WebSocket listening on port ${port}`);
  });
}
