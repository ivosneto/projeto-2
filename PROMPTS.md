# Project 2 – Development Prompts

This document contains the prompts used to guide the implementation of the Visual Analytics Project 2 dashboard. Each prompt describes a specific requirement or task in enough detail to reproduce or extend the work independently.

---

## Prompt 1 – Data Preprocessing Pipeline (Task 1)

> Create a Node.js script (`src/_server/preprocess_data.mjs`) that reads two CSV files — `recommendations-2021-12-31.csv` and `bgg_Gameitems.csv` — joins them by the BGG game ID, handles dirty data, and writes the result to `data/boardgames_1000.json`.
>
> The join key is `ID` in the recommendations file and `bgg_id` in the items file. The output JSON should contain an array of 1,000 game objects, sorted by rank ascending, each with the following fields:
>
> ```
> { id, title, year, rank, minplayers, maxplayers, minplaytime, maxplaytime, minage,
>   rating: { rating, num_of_reviews },
>   recommendations: { fans_liked: number[] },
>   types: { categories: [{id,name}], mechanics: [{id,name}] },
>   credit: { designer: [{name}] } }
> ```
>
> Handle the following data quality issues:
> - Playtime of 0 or negative: impute to 30 min
> - `min_players > max_players`: swap the values
> - Duplicate recommendation IDs: deduplicate with a Set
> - Missing year: store as null
> - Missing rating: store as 0
> - Missing categories: store as empty array
>
> Use the `csv-parse` npm package (already in dependencies). Log a summary of how many issues were found after processing.

---

## Prompt 2 – Server Configuration and Top-X Filter (Task 1)

> Update `src/_server/static/server.js` to:
> 1. Read `boardgames_1000.json` instead of `boardgames_100.json`
> 2. Remove the Express static file server (port 3000 conflicts with webpack-dev-server in development)
> 3. Keep only the Socket.IO server on port 3231
>
> Update `src/html/template.html` to replace the Top-X selector options with: Top 100 (selected by default), Top 200, Top 500, Top 1000.
>
> In `src/_server/preprocessing.js`, ensure `loadAndClean(rawData, topX)` sorts by rank and slices the first `topX` records before returning.

---

## Prompt 3 – K-Means Feature Encoding (Task 2)

> In `src/_server/preprocessing.js`, implement the function `encodeForKMeans(games)` that encodes each game as a 14-dimensional feature vector:
>
> - Dimensions 0–5 (numeric, normalized to [0,1]): `rating_value`, `playtime_avg`, `num_mechanics`, `minage`, `players_avg`, `log10(num_reviews + 1)`
> - Dimensions 6–13 (one-hot, binary): presence of each of the top-8 most frequent categories across the dataset (0 or 1)
>
> Normalization formula: `(value - min) / (max - min)`, with `max === min` mapping to 0.
>
> Return `{ vectors: number[][], featureNames: string[] }`.
>
> In `src/_server/kmeans.js`, implement three distance metrics as named exports:
> - `euclidean(a, b)` — L2 distance
> - `manhattan(a, b)` — L1 distance (sum of absolute differences)
> - `chebyshev(a, b)` — L∞ distance (maximum absolute difference)
>
> Also implement `kmeans(points, k, metric, maxIter)` using K-Means++ initialization: the first centroid is chosen randomly; each subsequent centroid is chosen with probability proportional to the squared distance to the nearest existing centroid.

---

## Prompt 4 – K-Means Scatter Plot Visualization (Task 2)

> In `src/_public/kmeans_plot.js`, implement `drawKMeansPlot(container, cluster_games, cluster_centroids, featureNames, onSelect)` using D3.js v7:
>
> - Axes: Rating (Y) × Avg Playtime (X). These are the display axes only — clustering was done in 14 dimensions server-side.
> - Draw one circle per game, colored by cluster ID using a fixed palette (different from the category palette used in other views).
> - Draw a dashed convex hull per cluster using `d3.polygonHull`. Skip clusters with fewer than 3 points.
> - Draw a diamond centroid marker per cluster at the average rating and playtime of its members.
> - Add a legend in the right margin showing for each cluster: color, `C{n} n={size}`, an auto-generated profile label (e.g. `Short · Complex` based on avg_playtime and avg_mechanics), and dominant category.
> - On click: call `onSelect(game.id)`.
> - Export `highlightKMeans(ids)` that applies `.faded` and `.highlighted` CSS classes based on whether each game's id is in the provided Set.

---

## Prompt 5 – PageRank Algorithm and Graph Builder (Task 3)

> In `src/_server/pagerank.js`, implement `pagerank(graph, alpha, eps, iter)`:
> - `graph` is an adjacency map: `{ nodeId: [neighborId, ...] }`
> - Use damping factor `alpha = 0.85` and convergence threshold `eps = 1e-6`
> - Handle dangling nodes (nodes with no out-edges) by distributing their rank equally to all nodes at each iteration
> - Initialize scores uniformly at `1/N`
> - Stop when the L1 delta between iterations is below `eps`
>
> In `src/_server/preprocessing.js`, implement `buildPageRankGraph(games)`:
> - Build the adjacency graph using only edges between games present in the current dataset
> - Run PageRank on the graph
> - Normalize scores to [0,1]
> - Return `{ pr_nodes, pr_edges, top_games }` where `top_games` is the top-10 by PageRank score

---

## Prompt 6 – Force-Directed PageRank Graph (Task 3)

> In `src/_public/pagerank_graph.js`, implement `drawPageRankGraph(container, pr_nodes, pr_edges, top_games, colorScale, onSelect)`:
>
> - Use `d3.forceSimulation` with link, charge, center and collision forces
> - Node radius: `d3.scaleSqrt` mapped from `pr_norm` to range `[3, 18]`
> - Color nodes by `category_primary` using the shared color scale
> - Top-10 nodes (by PageRank): gold stroke ring, always-visible title label
> - Other nodes: dark thin stroke
> - Draw directed edges with SVG arrow markers
> - Enable zoom and pan on the SVG with `d3.zoom`
> - Enable node drag with `d3.drag`
> - On node click: call `onSelect(Number(node.id))`
>
> Export two functions:
> - `highlightPageRank(ids)`: applies `.faded`/`.highlighted` classes
> - `selectPageRankNode(selectedId, recIds)`: amber thick stroke for the selected node, teal stroke for direct recommendees, gold for top-10, default for others

---

## Prompt 7 – Linked Highlighting Architecture (Task 4)

> In `src/_public/index.js`, implement a linked highlighting system connecting all 5 views:
>
> State:
> - `highlightIds: Set<number> | null` — game IDs highlighted by a click
> - `brushFilter: Set<number> | null` — game IDs within the current PC brush
>
> Behavior:
> - Any click in K-Means, PageRank, or Bubble Matrix calls `toggleHighlight(ids)`, which sets `highlightIds` and propagates to all views via `applyHighlightToAll()`
> - A brush in Parallel Coordinates sets `brushFilter` and calls `applyBrushToAll()`
> - The "Clear highlight" button calls `clearAll()` which resets both variables and all views
> - Toggle: clicking the same selection again clears the highlight
>
> When a PageRank node is clicked:
> 1. Compute `recIds` (Set of `fans_liked` IDs present in the dataset)
> 2. Set `highlightIds = new Set([id, ...recIds])`
> 3. Call `selectPageRankNode(id, recIds)` for visual differentiation
> 4. Show a game detail panel in the sidebar with: title, rank, rating, PageRank score, list of recommendees, and shared category/mechanic tags
>
> The chord diagram should be redrawn — not just faded — when a selection is active, using only the edges belonging to selected game IDs.

---

## Prompt 8 – Chord Diagram with Linked Redraw (Task 4 / Project 1)

> Refactor `src/_public/chord.js` to support linked highlighting by storing module-level state: `_container`, `_allEdges`, `_topMechanics`, `_colorScale`.
>
> Export:
> - `drawChord(container, chord_edges, top_mechanics, colorScale)`: stores state and calls the internal `_render(edges)` function
> - `highlightChord(ids)`: if null, renders all edges; if a `Set<number>`, filters `_allEdges` to edges where `game_id ∈ ids` and redraws. Fall back to all edges if the filtered set is empty.
>
> `_render(edges)` should clear the container and rebuild the full D3 chord diagram:
> - Nodes = unique categories ∪ top mechanics
> - N×N co-occurrence matrix from the provided edges
> - Use `d3.chord`, `d3.arc`, `d3.ribbon`
> - Color arcs by category (shared color scale); mechanics with a fixed dark color
> - Mouseover tooltips showing node name and total connection count

---

## Prompt 9 – Sidebar Game Detail Panel

> Add a "Selected Game" section to `template.html` (hidden by default, `display:none`) that appears when a node is clicked in the PageRank graph.
>
> The panel (`#game-detail-panel` inside `#section-game-detail`) should display:
> - Game title (heading style)
> - Rank and rating (muted text)
> - PageRank score (highlighted in amber/gold)
> - Primary category
> - Up to 6 games it recommends that are present in the current dataset
> - Tags for categories and mechanics shared between the selected game and its recommendees (categories in blue, mechanics in green)
>
> The panel should hide again when "Clear highlight" is clicked or when a new dataset is loaded.
>
> CSS classes needed: `.gd-title`, `.gd-meta`, `.gd-pr`, `.gd-label`, `.gd-list`, `.gd-tags`, `.gd-tag.cat`, `.gd-tag.mech`
