/**
 * index.js – Project 2 frontend orchestration
 *
 * Handles:
 *  - WebSocket connection to port 3231
 *  - Controls: topX, k (slider), metric (select)
 *  - Draws all 5 charts on freshData
 *  - Linked highlight: selecting in k-means or pagerank highlights in ALL views
 *  - PC brush propagates filter to bubble + cluster + graph
 *  - Clear highlight button
 */

import './app.css';
import * as d3 from 'd3';
import { io } from 'socket.io-client';

import { drawParallelCoords, highlightPC }              from './parallel_coords.js';
import { drawBubbleMatrix, highlightBubble, filterBubble } from './bubble_matrix.js';
import { drawKMeansPlot, highlightKMeans }               from './kmeans_plot.js';
import { drawPageRankGraph, highlightPageRank, selectPageRankNode } from './pagerank_graph.js';
import { drawChord, highlightChord }                      from './chord.js';

// ── Tooltip (one global element) ─────────────────────────────────────────────
const tooltip = document.createElement('div');
tooltip.id = 'tooltip';
document.body.appendChild(tooltip);

// ── Application state ─────────────────────────────────────────────────────────
let currentData  = null;
let colorScale   = d3.scaleOrdinal(d3.schemeTableau10);
let brushFilter  = null;   // Set<id> from PC brush (null = no filter)
let highlightIds = null;   // Set<id> from click selection (null = none)

// ── DOM controls ──────────────────────────────────────────────────────────────
const ctrlTopX   = document.getElementById('ctrl-topX');
const ctrlK      = document.getElementById('ctrl-k');
const ctrlKVal   = document.getElementById('ctrl-k-val');
const ctrlMetric = document.getElementById('ctrl-metric');
const btnClear   = document.getElementById('btn-clear');
const selInfo    = document.getElementById('selected-info');

ctrlK.addEventListener('input', () => {
  ctrlKVal.textContent = ctrlK.value;
  requestData();
});
ctrlTopX.addEventListener('change', requestData);
ctrlMetric.addEventListener('change', requestData);
btnClear.addEventListener('click', clearAll);

// ── WebSocket ─────────────────────────────────────────────────────────────────
const socket = io('http://localhost:3231');
socket.on('connect',     () => console.log('[ws] connected'));
socket.on('disconnect',  () => console.log('[ws] disconnected'));
socket.on('freshData',   onFreshData);
socket.on('serverError', e  => console.error('[ws] server error:', e.message));

function requestData() {
  socket.emit('requestData', {
    topX:   Number(ctrlTopX.value),
    k:      Number(ctrlK.value),
    metric: ctrlMetric.value,
  });
}

// ── Fresh data handler ────────────────────────────────────────────────────────
function onFreshData(data) {
  currentData  = data;
  brushFilter  = null;
  highlightIds = null;

  // Build color scale from this dataset's top categories
  const catNames = data.top_categories.map(c => c.name);
  colorScale = d3.scaleOrdinal()
    .domain([...catNames, 'Other'])
    .range([...d3.schemeTableau10, '#94a3b8']);

  updateIssuesPanel(data.issues_summary);
  updateLegend(data.top_categories);
  updateSelInfo(null);

  // ── Draw charts ───────────────────────────────────────────────────────────

  // 1. Parallel Coordinates (Project 1 – Explore / Overall)
  drawParallelCoords('chart-pc', data.pc_data, colorScale, ids => {
    brushFilter = ids;
    applyBrushToAll();
  });

  // 2. Bubble Matrix (Project 1 – playtime × rating)
  drawBubbleMatrix('chart-bubble', data.bubble_data, colorScale, id => {
    toggleHighlight(new Set([id]));
  });

  // 3. K-Means scatter (Task 2 – Trend / Cluster)
  drawKMeansPlot(
    'chart-kmeans',
    data.cluster_games,
    data.cluster_centroids,
    data.featureNames,
    id => {
      // Clicking a game: highlight its whole cluster
      const game = data.cluster_games.find(g => g.id === id);
      if (!game) return;
      const clusterIds = new Set(
        data.cluster_games.filter(g => g.cluster === game.cluster).map(g => g.id)
      );
      toggleHighlight(clusterIds);
    }
  );

  // 4. PageRank force graph (Task 3 – Significance / Graph)
  drawPageRankGraph(
    'chart-pagerank',
    data.pr_nodes,
    data.pr_edges,
    data.top_games,
    colorScale,
    id => {
      // Clicking a node: highlight it + all games it recommends
      const game = data.games.find(g => g.id === id);
      if (!game) return;
      const recIds = new Set(game.fans_liked.filter(fid => data.games.some(g => g.id === fid)));
      const ids = new Set([id, ...recIds]);
      toggleHighlight(ids);
      showGameDetail(id);
      selectPageRankNode(id, recIds);
    }
  );

  // 5. Chord (Project 1 – co-occurrence)
  drawChord('chart-chord', data.chord_edges, data.top_mechanics, colorScale);
}

// ── Linked highlight logic ────────────────────────────────────────────────────

/**
 * Toggle highlight: if same set already highlighted → clear; else set new.
 */
function toggleHighlight(ids) {
  if (highlightIds && setsEqual(highlightIds, ids)) {
    highlightIds = null;
  } else {
    highlightIds = ids;
  }
  applyHighlightToAll();
  updateSelInfo(highlightIds);
}

function applyHighlightToAll() {
  highlightPC(highlightIds);
  highlightBubble(highlightIds);
  highlightKMeans(highlightIds);
  highlightPageRank(highlightIds);
  highlightChord(highlightIds);
}

function applyBrushToAll() {
  // PC brush filters bubble matrix and also dims cluster/graph nodes
  filterBubble(brushFilter);
  highlightKMeans(brushFilter);
  highlightPageRank(brushFilter);
  highlightChord(brushFilter);

  if (brushFilter) {
    selInfo.textContent = `${brushFilter.size} games selected by PC brush.`;
  } else {
    updateSelInfo(highlightIds);
  }
}

function clearAll() {
  brushFilter  = null;
  highlightIds = null;
  applyHighlightToAll();
  filterBubble(null);
  highlightChord(null);
  updateSelInfo(null);
  showGameDetail(null);
  selectPageRankNode(null, null);
}

// ── PageRank game detail panel ────────────────────────────────────────────────

function showGameDetail(id) {
  const section = document.getElementById('section-game-detail');
  const panel   = document.getElementById('game-detail-panel');
  if (!id || !currentData) { if (section) section.style.display = 'none'; return; }

  const game   = currentData.games.find(g => g.id === id);
  if (!game) return;

  const prNode  = currentData.pr_nodes.find(n => Number(n.id) === id);
  const prScore = prNode ? prNode.pr_score.toFixed(5) : 'N/A';

  const recGames = (game.fans_liked || [])
    .map(fid => currentData.games.find(g => g.id === fid))
    .filter(Boolean)
    .slice(0, 6);

  const sharedCats = game.categories
    .filter(c => recGames.some(rg => rg.categories.includes(c)))
    .slice(0, 4);
  const sharedMechs = game.mechanics
    .filter(m => recGames.some(rg => rg.mechanics.includes(m)))
    .slice(0, 4);

  panel.innerHTML =
    `<div class="gd-title">${game.title}</div>` +
    `<div class="gd-meta">Rank #${game.rank} · Rating ${game.rating_value.toFixed(2)}</div>` +
    `<div class="gd-meta">PageRank: <span class="gd-pr">${prScore}</span></div>` +
    `<div class="gd-meta">Category: ${game.category_primary}</div>` +
    (recGames.length
      ? `<div class="gd-label">Recommends (in dataset)</div>` +
        `<ul class="gd-list">${recGames.map(g => `<li>${g.title}</li>`).join('')}</ul>`
      : '') +
    (sharedCats.length + sharedMechs.length
      ? `<div class="gd-label">Shared features</div>` +
        `<div class="gd-tags">` +
        sharedCats.map(c => `<span class="gd-tag cat">${c}</span>`).join('') +
        sharedMechs.map(m => `<span class="gd-tag mech">${m}</span>`).join('') +
        `</div>`
      : '');

  section.style.display = '';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateIssuesPanel(s) {
  const el = document.getElementById('issues-panel');
  if (!el) return;
  el.innerHTML =
    `Issues found: <span class="bad">${s.total}</span><br>` +
    `Missing year: ${s.missing_year}<br>` +
    `Bad playtime: ${s.invalid_playtime}<br>` +
    `No rating: ${s.missing_rating}<br>` +
    `No category: ${s.missing_category}`;
}

function updateLegend(top_categories) {
  const el = document.getElementById('legend');
  if (!el) return;
  el.innerHTML = '';
  for (const c of top_categories.slice(0, 10)) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML =
      `<div class="legend-swatch" style="background:${colorScale(c.name)}"></div>` +
      `<span>${c.name} (${c.count})</span>`;
    el.appendChild(item);
  }
}

function updateSelInfo(ids) {
  if (!ids || ids.size === 0) {
    selInfo.textContent = 'Click a node/dot to highlight. Click again to clear.';
    return;
  }
  if (!currentData) return;
  if (ids.size === 1) {
    const [id] = ids;
    const g = currentData.games.find(g => g.id === id);
    selInfo.textContent = g ? `Selected: ${g.title} (#${g.rank})` : `Game ${id}`;
  } else {
    selInfo.textContent = `${ids.size} games highlighted.`;
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
