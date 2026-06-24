/**
 * K-Means clustering for multidimensional data.
 * Supports pluggable distance metrics.
 * Adapted for the Visual Analytics Project 2.
 */

// ── Distance measures ────────────────────────────────────────────────────────

export function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function manhattan(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

export function chebyshev(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

export const DISTANCE_METRICS = { euclidean, manhattan, chebyshev };

// ── Helper: compute centroid ─────────────────────────────────────────────────

function centroid(points) {
  const dim = points[0].length;
  const c = new Array(dim).fill(0);
  for (const p of points) for (let i = 0; i < dim; i++) c[i] += p[i];
  for (let i = 0; i < dim; i++) c[i] /= points.length;
  return c;
}

// ── Helper: assign each point to nearest centroid ────────────────────────────

function assign(points, centroids, distFn) {
  return points.map(p => {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = distFn(p, centroids[c]);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  });
}

// ── K-Means++ initialisation ─────────────────────────────────────────────────

function kmeanspp(points, k, distFn) {
  const centroids = [];
  // Pick random first centroid
  centroids.push(points[Math.floor(Math.random() * points.length)]);
  for (let c = 1; c < k; c++) {
    // Squared distances to nearest centroid
    const dists = points.map(p => {
      const d = Math.min(...centroids.map(cn => distFn(p, cn)));
      return d * d;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(points[i]); break; }
    }
  }
  return centroids;
}

// ── Main k-means function ────────────────────────────────────────────────────

/**
 * @param {number[][]} points  – array of numeric vectors (already normalised)
 * @param {number}     k       – number of clusters
 * @param {string}     metric  – 'euclidean' | 'manhattan' | 'chebyshev'
 * @param {number}     maxIter – max iterations (default 200)
 * @returns {{ labels: number[], centroids: number[][], iterations: number }}
 */
export function kmeans(points, k, metric = 'euclidean', maxIter = 200) {
  if (points.length === 0) return { labels: [], centroids: [], iterations: 0 };
  k = Math.min(k, points.length);

  const distFn = DISTANCE_METRICS[metric] || euclidean;
  let centroids = kmeanspp(points, k, distFn);
  let labels = assign(points, centroids, distFn);
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Recompute centroids
    const newCentroids = centroids.map((_, ci) => {
      const members = points.filter((_, i) => labels[i] === ci);
      return members.length > 0 ? centroid(members) : centroids[ci];
    });

    // Check convergence
    const converged = newCentroids.every((nc, ci) =>
      distFn(nc, centroids[ci]) < 1e-9
    );
    centroids = newCentroids;
    labels = assign(points, centroids, distFn);
    if (converged) { iter++; break; }
  }

  return { labels, centroids, iterations: iter };
}
