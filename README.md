# BoardGame Visual Analytics – Project 2

Visual Analytics · Summer Semester 2026 · Universität zu Köln

---

## Table of Contents

1. [Project Structure](#structure)
2. [Installation and Setup](#setup)
3. [Task 1 – Dataset, Dirty Data and Preprocessing](#task1)
4. [Task 2 – K-Means Clustering (Trend)](#task2)
5. [Task 3 – PageRank and Recommendation Graph (Graph · Significance)](#task3)
6. [Task 4 – Linked Highlighting Across All Views](#task4)
7. [Design Decisions](#design)
8. [Grading Criteria Coverage](#criteria)

---

## 1. Project Structure <a name="structure"></a>

```
Template/
├── data/
│   ├── recommendations-2021-12-31.csv   # top-1000 games + up to 28 fan recommendations each
│   ├── bgg_Gameitems.csv                # full BGG metadata (~114k games)
│   └── boardgames_1000.json             # generated dataset (output of preprocessing script)
├── src/
│   ├── _server/
│   │   ├── preprocess_data.mjs   # one-time CSV join and cleaning script
│   │   ├── preprocessing.js      # cleaning, encoding, k-means, pagerank, view builders
│   │   ├── kmeans.js             # K-Means++ with euclidean/manhattan/chebyshev metrics
│   │   ├── pagerank.js           # PageRank with dangling node handling (α=0.85, ε=1e-6)
│   │   └── static/
│   │       └── server.js         # Socket.IO on port 3231
│   ├── _public/
│   │   ├── index.js              # frontend orchestration, WebSocket, highlight state
│   │   ├── parallel_coords.js    # Parallel Coordinates with brush (Project 1)
│   │   ├── bubble_matrix.js      # Bubble scatter playtime × rating (Project 1)
│   │   ├── chord.js              # Category × Mechanic chord diagram (Project 1)
│   │   ├── kmeans_plot.js        # Scatter + convex hulls + centroids (Task 2)
│   │   └── pagerank_graph.js     # Force-directed graph with PageRank (Task 3)
│   └── html/
│       └── template.html         # layout + sidebar controls
└── package.json
```

---

## 2. Installation and Setup <a name="setup"></a>

```bash
# 1. Install dependencies
cd Template
npm install

# 2. Generate the dataset (only needs to run once)
node src/_server/preprocess_data.mjs

# 3. Start the development server
npm run dev
```

Open `http://localhost:3000` in your browser.

> **Ports:** webpack-dev-server on 3000 (frontend) · Socket.IO on 3231 (data)

---

## 3. Task 1 – Dataset, Dirty Data and Preprocessing <a name="task1"></a>

### Data Sources

| File | Rows | Content |
|------|------|---------|
| `recommendations-2021-12-31.csv` | 1,000 | BGG top-1000 (2021): rank, average rating, number of votes, up to 28 fan recommendation IDs per game |
| `bgg_Gameitems.csv` | ~113,904 | Full metadata: categories, mechanics, player count, playtime, minimum age, designer, etc. |

### CSV Join

The script `src/_server/preprocess_data.mjs` runs once to produce `boardgames_1000.json`:

```js
// Read both CSVs in parallel
const [recRows, itemRows] = await Promise.all([
  parseCSV('recommendations-2021-12-31.csv'),
  parseCSV('bgg_Gameitems.csv'),
]);

// Index metadata by bgg_id
const itemMap = new Map();
for (const row of itemRows) {
  const id = Number(row.bgg_id);
  if (isFinite(id)) itemMap.set(id, row);
}

// For each ranked game: join metadata and clean
for (const rec of recRows) {
  const item = itemMap.get(Number(rec.ID)) || {};
  // ... cleaning and normalization
  games.push({ id, title, year, rank, minplayers, maxplayers,
               minplaytime, maxplaytime, minage, rating, recommendations,
               types: { categories, mechanics }, credit: { designer } });
}
```

### Data Quality Issues and Handling

| Issue | Games affected | Handling strategy |
|-------|---------------|-------------------|
| Invalid playtime (0 or negative) | 1 | Imputed: `minplaytime = 30`, `maxplaytime = minplaytime` |
| Missing categories | 2 | Stored as `[]`; `category_primary = "Other"` |
| `min_players > max_players` | variable | Values automatically swapped |
| Duplicate recommendations | variable | Deduplicated using `Set` before storing |
| Missing or non-numeric year | variable | Stored as `null`; flagged in sidebar panel |
| Missing rating | variable | Fallback to `0`; flagged in sidebar panel |
| Numeric fields for k-means | all | Normalized to `[0, 1]` |
| Categorical fields for k-means | all | One-hot encoded (top-8 categories) |

The **Data Quality** panel in the sidebar shows live counters for the currently selected top-X. Below the counters, the **Cleaning strategy** section lists the treatment applied to each issue type.

### Dynamic Top-X Filtering

The JSON contains 1,000 games sorted by rank. The `loadAndClean` function slices the first `topX` without reloading the file:

```js
// preprocessing.js
export function loadAndClean(rawData, topX = 100) {
  const cleaned = rawData.map(cleanGame).filter(Boolean);
  cleaned.sort((a, b) => a.rank - b.rank);
  return { games: cleaned.slice(0, topX), issues };
}
```

The sidebar selector triggers a WebSocket `requestData` event; the server recomputes k-means and PageRank for the new subset and emits `freshData`:

```js
// index.js
ctrlTopX.addEventListener('change', requestData);

function requestData() {
  socket.emit('requestData', {
    topX:   Number(ctrlTopX.value),   // 100 | 200 | 500 | 1000
    k:      Number(ctrlK.value),
    metric: ctrlMetric.value,
  });
}
```

---

## 4. Task 2 – K-Means Clustering (Trend) <a name="task2"></a>

### Analysis Task (5-tuple)

| Component | Value |
|-----------|-------|
| **Who** | Board game analyst |
| **What (Action)** | **Identify** — check for a **Trend** |
| **How** | K-Means++ in N-dimensional feature space; projected onto Rating × Playtime |
| **With what data** | 6 numeric features + 8 one-hot category dimensions (14 total) |
| **Why** | Discover whether games that are similar in complexity, quality and theme form cohesive groups — and whether those groups manifest as distinct rating/playtime bands within the top-X ranking |

**Analysis task in plain language:**
> "Is there a trend where board games with similar mechanics and categories also cluster into distinct rating and playtime bands? And does this cluster structure remain stable when varying k or the distance metric?"

### Feature Encoding

Numeric fields are normalized to `[0, 1]`. Categories are binary one-hot encoded, ensuring all dimensions have equal weight under any distance metric:

```js
// preprocessing.js – encodeForKMeans()
const featureNames = [
  'Rating',       // normalized [0,1]
  'Playtime',     // normalized [0,1]
  '#Mechanics',   // normalized [0,1]
  'Min Age',      // normalized [0,1]
  'Players',      // normalized [0,1]
  'log(Reviews)', // log10(num_reviews + 1), normalized [0,1]
  ...top8cats.map(c => `cat:${c}`),  // 0 or 1 (one-hot)
];

const vectors = games.map((g, gi) => [
  norm(g.rating_value,  mins.rating_value,  maxs.rating_value),
  norm(g.playtime_avg,  mins.playtime_avg,  maxs.playtime_avg),
  norm(g.num_mechanics, mins.num_mechanics, maxs.num_mechanics),
  norm(g.minage,        mins.minage,        maxs.minage),
  norm(g.players_avg,   mins.players_avg,   maxs.players_avg),
  norm(logReviews[gi],  minLR,              maxLR),
  ...top8cats.map(c => g.categories.includes(c) ? 1 : 0),
]);
```

### K-Means++ Initialization

```js
// kmeans.js – kmeanspp()
function kmeanspp(points, k, distFn) {
  const centroids = [points[Math.floor(Math.random() * points.length)]];
  for (let c = 1; c < k; c++) {
    const dists = points.map(p =>
      Math.min(...centroids.map(cn => distFn(p, cn))) ** 2
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(points[i]); break; }
    }
  }
  return centroids;
}
```

K-Means++ initialization guarantees well-spaced initial centroids, reducing the number of iterations needed and avoiding poor local minima.

### Distance Metrics

```js
// kmeans.js
export function euclidean(a, b) {   // standard — amplifies large deviations (squared)
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function manhattan(a, b) {   // robust with one-hot — sums absolute deviations
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

export function chebyshev(a, b) {   // sensitive to the single largest deviation
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}
```

**Why Manhattan as starting point:** with binary one-hot dimensions (0/1) mixed with continuous fields, Manhattan distributes weight more uniformly than Euclidean, which squares differences and over-weights outliers in continuous dimensions.

### Visualization

- **Display axes:** Rating (Y) × Avg Playtime (X) — most interpretable; clustering occurs in all 14 dimensions
- **Color:** fixed cluster palette (different from the category palette used in other views)
- **Convex hull** per cluster: shows extent and overlap in 2D projection
- **Centroid diamond:** mean position of each cluster on the display axes
- **Legend:** each cluster shows `C1 n=33`, an auto-generated profile (e.g. `Short · Complex`) and the dominant category

```js
// kmeans_plot.js – automatic descriptive profile
function _clusterProfile(c) {
  const time  = c.avg_playtime  >= 150 ? 'Long'   : c.avg_playtime  >= 75 ? 'Medium' : 'Short';
  const cmplx = c.avg_mechanics >= 6   ? 'Complex' : c.avg_mechanics >= 4 ? 'Standard' : 'Light';
  return `${time} · ${cmplx}`;
}
```

### Interaction

| Control | Action | Interaction cost |
|---------|--------|-----------------|
| k slider (2–12) | Recomputes k-means via WebSocket | 1 drag |
| Metric dropdown | Recomputes with new metric | 1 click |
| Click a dot | Highlights the entire cluster in all 5 views | 1 click |
| Click again | Toggle: clears the highlight | 1 click |

---

## 5. Task 3 – PageRank and Recommendation Graph <a name="task3"></a>

### Analysis Task (5-tuple)

| Component | Value |
|-----------|-------|
| **Who** | Board game analyst / recommender |
| **What (Action)** | **Describe / Correlate** |
| **How** | Force-directed graph with node size ∝ PageRank; click reveals shared features panel |
| **With what data** | PageRank significance scores, `fans_liked` edges, game features (category, mechanics, rating) |
| **Why** | Identify key games in the recommendation network and describe which characteristics (category, mechanics, complexity) correlate with high significance and with being frequently recommended from hub games |

**Analysis task in plain language:**
> "Which characteristics correlate with a game being a central hub in the recommendation network — and what does a key game have in common with the games it recommends?"

### Graph Construction

```js
// preprocessing.js – buildPageRankGraph()
const graph = {};
for (const g of games) {
  const src = String(g.id);
  graph[src] = [];
  for (const fl of g.fans_liked) {
    const dst = String(fl);
    if (ids.has(dst) && dst !== src)   // only edges within the dataset
      graph[src].push(dst);
  }
}
const pr_scores = pagerank(graph);  // α=0.85, ε=1e-6
```

| Top-X | Nodes | Edges |
|-------|-------|-------|
| 100   | 100   | 936   |
| 1000  | 1000  | 16,329 |

### PageRank Algorithm

```js
// pagerank.js
export function pagerank(graph, alpha = 0.85, eps = 1e-6, iter = 100) {
  let scores = new Float64Array(N).fill(1 / N);
  const teleport = (1 - alpha) / N;

  for (let it = 0; it < iter; it++) {
    const next = new Float64Array(N).fill(teleport);

    let dangling = 0;
    for (let i = 0; i < N; i++) if (outDeg[i] === 0) dangling += scores[i];
    const danglingContrib = (alpha * dangling) / N;

    for (let i = 0; i < N; i++) {
      next[i] += danglingContrib;
      for (const src of inEdges[i])
        next[i] += alpha * scores[src] / outDeg[src];
    }

    let delta = 0;
    for (let i = 0; i < N; i++) delta += Math.abs(next[i] - scores[i]);
    scores = next;
    if (delta < eps) break;
  }
}
```

### Visualization (Force-Directed Graph)

- **Node radius ∝ PageRank** (sqrt scale to prevent visual dominance of hubs)
- **Gold ring** on top-10 nodes + always-visible label
- **Directed edges with arrows:** A → B means "fans of A also like B"
- **Color by category** (consistent palette across all views)
- **Zoom + pan** via `d3.zoom` · **Drag** nodes to reorganize

### Node Click – Visual Differentiation and Detail Panel

```js
// pagerank_graph.js – selectPageRankNode()
function _applySelectionStyles() {
  _nodeSelection
    .attr('stroke', d => {
      if (_selectedId && d.id === _selectedId) return '#fbbf24'; // amber – selected game
      if (_selectedId && _recIds.has(d.id))     return '#38bdf8'; // teal  – direct recommendees
      return _topIds.has(d.id) ? '#f5c518' : '#1a1d27';
    })
    .attr('stroke-width', d => {
      if (_selectedId && d.id === _selectedId) return 4;
      if (_selectedId && _recIds.has(d.id))     return 2.5;
      return _topIds.has(d.id) ? 2.5 : 0.8;
    });
}
```

Clicking a node shows the **Selected Game** panel in the sidebar with title, rank, rating, PageRank score, list of recommendees, and shared category/mechanic tags.

---

## 6. Task 4 – Linked Highlighting <a name="task4"></a>

### Architecture

```
[K-Means click]   ──┐
[PageRank click]  ──┼──→  highlightIds: Set<id> | null  ──→  applyHighlightToAll()
[Bubble click]    ──┘                                              │
                                                                   ├──→ highlightPC()
[PC brush]  ────────────→  brushFilter:  Set<id> | null            ├──→ highlightBubble()
                                                                   ├──→ highlightKMeans()
                                                                   ├──→ highlightPageRank()
                                                                   └──→ highlightChord()
```

### Chord Diagram is Redrawn, Not Just Faded

```js
// chord.js
export function highlightChord(ids) {
  if (!ids) { _render(_allEdges); return; }
  const filtered = _allEdges.filter(e => ids.has(e.game_id));
  _render(filtered.length > 0 ? filtered : _allEdges);
}
```

Redrawing changes arc proportions, revealing which categories and mechanics dominate the selected subset — information that a simple fade cannot convey.

### Example Analysis Workflow

1. **In K-Means:** click a game from a high-complexity cluster → highlights the cluster in all 5 views
2. **In Parallel Coordinates:** confirm high rating and high minimum age
3. **In Chord:** see "Worker Placement" dominate the redrawn diagram
4. **In PageRank:** identify which games in the cluster are recommendation hubs
5. **In Bubble Matrix:** observe the playtime vs. rating distribution of the cluster

---

## 7. Design Decisions <a name="design"></a>

**Scatter for K-Means:** Rating × Playtime are the most interpretable axes. Clustering occurs in 14 dimensions, but projecting to 2D allows visual comparison of cluster cohesion and overlap. The convex hull makes each cluster's extent explicit.

**Manhattan as default metric:** With binary one-hot dimensions (0/1) mixed with continuous fields, Manhattan distributes weight more uniformly than Euclidean, which squares differences and over-weights outliers in continuous dimensions.

**Force-directed for PageRank:** The recommendation graph is non-hierarchical and sparse. Force layout naturally positions high-connectivity hubs toward the center, and interactive drag allows reorganizing regions of interest. An adjacency matrix would be unreadable at top-500/1000 scale.

**Chord redrawn vs. faded:** Fading arcs does not change visual proportions — no new information is revealed. Redrawing the chord matrix with only the selected games' edges changes arc and ribbon proportions, showing the category and mechanic composition of the group.

**Keeping Project 1 views:** The Project 2 specification requires linked highlighting to include Project 1 visualizations. Parallel Coordinates and Bubble Matrix serve as comparative context when a cluster or node is selected.

---

## 8. Grading Criteria Coverage <a name="criteria"></a>

| # | Criterion | Where it is implemented |
|---|-----------|------------------------|
| 1 | New dataset incorporated in all views | `boardgames_1000.json` used across all 5 views |
| 2 | Data quality issues clear and handled | "Data Quality" panel + "Cleaning strategy" section in sidebar |
| 3 | Preprocessing clear and well-argued | `preprocess_data.mjs` + `encodeForKMeans()` + Task 1 section in this README |
| 4 | Top-X dynamic filtering | Sidebar selector: 100 / 200 / 500 / 1000 |
| 5 | 5-tuple Trend task designed for Task 2 | Task 2 section in this README |
| 6 | Clustering visualization implemented | Scatter + convex hulls + centroids in `kmeans_plot.js` |
| 7 | Visualization appropriate for the task | Design Decisions section + auto-generated cluster profiles |
| 8 | Interaction with k intuitive | k slider in sidebar (1 drag → recomputes) |
| 9 | Distance metric adaptable dynamically | Dropdown with 3 metrics (1 click → recomputes) |
| 10 | Visualization using PageRank | Force-directed graph in `pagerank_graph.js` |
| 11 | Argumentation for correlation description | Task 3 section + shared features panel |
| 12 | Significance scores and recommendations as core components | Node size ∝ PageRank · edges = `fans_liked` · detail panel |
| 13 | Correlations between key game and recommendees | Amber ring (selected) + teal ring (recommendees) + shared features |
| 14 | Selection from Task 2 and Task 3 for highlighting | K-Means click → cluster · PageRank click → recommendees |
| 15 | Highlighting in Project 1 and Project 2 views | All 5 views respond via `applyHighlightToAll()` |
| 16 | Demonstration of how highlighting supports analysis | Step-by-step example in Task 4 section |
| 17 | Argumentation for included/excluded elements | Design Decisions section |
