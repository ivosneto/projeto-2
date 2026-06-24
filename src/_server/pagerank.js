/**
 * PageRank implementation for boardgame recommendation network.
 * Based on the algorithm from https://github.com/alixaxel/pagerank.js/
 * Adapted for the Visual Analytics Project 2.
 */

/**
 * Compute PageRank scores for a directed graph.
 * @param {Object} graph  – adjacency: { nodeId: [neighborId, ...], ... }
 * @param {number} alpha  – damping factor (default 0.85)
 * @param {number} eps    – convergence epsilon (default 1e-6)
 * @param {number} iter   – max iterations (default 100)
 * @returns {Object}      – { nodeId: score, ... }
 */
export function pagerank(graph, alpha = 0.85, eps = 1e-6, iter = 100) {
  const nodes = Object.keys(graph);
  const N = nodes.length;
  if (N === 0) return {};

  // Index map for fast lookup
  const idx = {};
  nodes.forEach((n, i) => (idx[n] = i));

  // Build out-degree and in-edge list
  const outDeg = new Float64Array(N);
  const inEdges = Array.from({ length: N }, () => []);

  for (const src of nodes) {
    const si = idx[src];
    const neighbours = graph[src] || [];
    outDeg[si] = neighbours.length;
    for (const dst of neighbours) {
      if (idx[dst] !== undefined) {
        inEdges[idx[dst]].push(si);
      }
    }
  }

  // Initialise scores uniformly
  let scores = new Float64Array(N).fill(1 / N);
  const teleport = (1 - alpha) / N;

  for (let it = 0; it < iter; it++) {
    const next = new Float64Array(N).fill(teleport);

    // Dangling nodes (out-degree 0) distribute rank equally
    let dangling = 0;
    for (let i = 0; i < N; i++) {
      if (outDeg[i] === 0) dangling += scores[i];
    }
    const danglingContrib = (alpha * dangling) / N;

    for (let i = 0; i < N; i++) {
      next[i] += danglingContrib;
      for (const src of inEdges[i]) {
        next[i] += alpha * scores[src] / outDeg[src];
      }
    }

    // Check convergence
    let delta = 0;
    for (let i = 0; i < N; i++) delta += Math.abs(next[i] - scores[i]);
    scores = next;
    if (delta < eps) break;
  }

  const result = {};
  nodes.forEach((n, i) => (result[n] = scores[i]));
  return result;
}
