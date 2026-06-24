/**
 * kmeans_plot.js – K-Means cluster visualization (Task 2, Project 2)
 *
 * ── Analysis Task (5-tuple) ──────────────────────────────────────────────────
 * Goal:            Trend
 * Means:           K-Means clustering (N-dim feature space) displayed as 2D scatter
 * Characteristics: Multivariate, quantitative + categorical, cluster patterns
 * Target:          Rating × Playtime (display axes), full feature vector for clustering
 * Cardinality:     Overall
 *
 * Task (plain text):
 *   Identify whether there is a trend in which groups of boardgames with
 *   similar complexity (mechanics, playtime, minage), quality (rating, reviews)
 *   and theme (category one-hot) naturally cluster together — and whether
 *   those clusters correspond to distinct rating/playtime profiles visible in
 *   the top-X ranking. Analysts can vary k and the distance metric to explore
 *   how robust the cluster structure is.
 *
 * ── Design decisions ─────────────────────────────────────────────────────────
 * - Display axes: Rating (Y) × Avg Playtime (X) — both interpretable and stable
 * - Clustering: done server-side in full N-dim space (6 numeric + 8 one-hot)
 * - Color: cluster ID → fixed palette (NOT category color, to distinguish from
 *   other views where color = category)
 * - Convex hull per cluster: shows extent / overlap of clusters
 * - Centroid diamonds: summary of each cluster position
 * - Click a dot → highlight that cluster's members in ALL linked views
 * - k and metric are controlled from the sidebar (low interaction cost: 1 slider,
 *   1 dropdown, automatic recompute)
 *
 * ── Why appropriate for Trend ────────────────────────────────────────────────
 * K-means groups games by multivariate similarity; the scatter+hull shows whether
 * similar games (by all features) also appear similar on the two most readable axes,
 * revealing whether there is a "trend" (e.g. high-mechanics games cluster at high
 * rating AND long playtime). Changing k reveals how stable that trend is.
 */

import * as d3 from 'd3';

let _dots = null;

// Fixed cluster colour palette (different from category palette)
function _clusterProfile(c) {
  const time = c.avg_playtime >= 150 ? 'Long' : c.avg_playtime >= 75 ? 'Medium' : 'Short';
  const cmplx = c.avg_mechanics >= 6 ? 'Complex' : c.avg_mechanics >= 4 ? 'Standard' : 'Light';
  return `${time} · ${cmplx}`;
}

const CLUSTER_COLORS = [
  '#6c8efb', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#38bdf8', '#fb923c', '#e879f9', '#4ade80', '#f472b6',
  '#94a3b8', '#facc15',
];
const clr = ci => CLUSTER_COLORS[ci % CLUSTER_COLORS.length];

export function drawKMeansPlot(container, cluster_games, cluster_centroids, featureNames, onSelect) {
  const el = document.getElementById(container);
  if (!el) return;
  el.innerHTML = '';

  if (!cluster_games || cluster_games.length === 0) {
    el.innerHTML = '<p style="color:#7a7f98;padding:20px">No clustering data available.</p>';
    return;
  }

  const W = el.clientWidth  || 500;
  const H = el.clientHeight || 300;
  const m = { top: 16, right: 110, bottom: 40, left: 50 };
  const w = W - m.left - m.right;
  const h = H - m.top  - m.bottom;

  const svg = d3.select(`#${container}`).append('svg')
    .attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  // Scales based on visible data dimensions (rating × playtime)
  const xExt = d3.extent(cluster_games, d => d.playtime_avg);
  const yExt = d3.extent(cluster_games, d => d.rating_value);
  const xScale = d3.scaleLinear().domain(xExt).range([0, w]).nice();
  const yScale = d3.scaleLinear().domain(yExt).range([h, 0]).nice();

  // Gridlines
  g.append('g').attr('class', 'km-axis')
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-w))
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('line').attr('stroke', '#2c2f3e').attr('stroke-dasharray', '2,3'));

  g.append('g').attr('class', 'km-axis').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(xScale).ticks(5).tickSize(-h))
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('line').attr('stroke', '#2c2f3e').attr('stroke-dasharray', '2,3'));

  // Axis labels
  g.append('text').attr('x', w / 2).attr('y', h + 34)
    .attr('text-anchor', 'middle').attr('fill', '#7a7f98').attr('font-size', 10)
    .text('Avg Playtime (min)  ← display axis (clustering uses full feature vector)');

  g.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -38)
    .attr('text-anchor', 'middle').attr('fill', '#7a7f98').attr('font-size', 10)
    .text('Rating');

  // ── Convex hulls ──────────────────────────────────────────────────────────
  const byCluster = d3.group(cluster_games, d => d.cluster);
  for (const [ci, members] of byCluster) {
    if (members.length < 3) continue;
    const pts  = members.map(d => [xScale(d.playtime_avg), yScale(d.rating_value)]);
    const hull = d3.polygonHull(pts);
    if (!hull) continue;
    g.append('path')
      .datum(hull)
      .attr('d', d => `M${d.map(p => p.join(',')).join('L')}Z`)
      .attr('fill', clr(ci)).attr('fill-opacity', .08)
      .attr('stroke', clr(ci)).attr('stroke-opacity', .35)
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const tip = d3.select('#tooltip');

  // ── Dots ──────────────────────────────────────────────────────────────────
  _dots = g.selectAll('circle.km-dot')
    .data(cluster_games)
    .join('circle')
    .attr('class', 'km-dot')
    .attr('cx', d => xScale(d.playtime_avg))
    .attr('cy', d => yScale(d.rating_value))
    .attr('r', 5.5)
    .attr('fill', d => clr(d.cluster))
    .attr('fill-opacity', .85)
    .attr('stroke', '#1a1d27').attr('stroke-width', .8)
    .style('cursor', 'pointer')
    .on('mouseover', (event, d) => {
      tip.classed('visible', true).html(
        `<strong>${d.title}</strong>` +
        `Cluster: <b style="color:${clr(d.cluster)}">C${d.cluster + 1}</b><br>` +
        `Rating: ${d.rating_value.toFixed(2)}<br>` +
        `Playtime: ${d.playtime_avg} min<br>` +
        `Mechanics: ${d.num_mechanics}<br>` +
        `Category: ${d.category_primary}`
      );
    })
    .on('mousemove', ev => tip.style('left', (ev.clientX + 12) + 'px').style('top', (ev.clientY - 28) + 'px'))
    .on('mouseleave', () => tip.classed('visible', false))
    .on('click', (_, d) => onSelect && onSelect(d.id));

  // ── Centroid diamonds ─────────────────────────────────────────────────────
  for (const c of cluster_centroids) {
    if (!c.size) continue;
    g.append('path')
      .attr('d', d3.symbol().type(d3.symbolDiamond).size(90)())
      .attr('transform', `translate(${xScale(c.avg_playtime)},${yScale(c.avg_rating)})`)
      .attr('fill', clr(c.id)).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');
  }

  // ── Cluster legend (right margin) ─────────────────────────────────────────
  const legG = g.append('g').attr('transform', `translate(${w + 8}, 0)`);
  cluster_centroids.forEach(c => {
    const ly = c.id * 34;
    legG.append('circle').attr('cx', 5).attr('cy', ly + 5).attr('r', 5).attr('fill', clr(c.id));
    legG.append('text').attr('x', 14).attr('y', ly + 9)
      .attr('fill', '#9da0b0').attr('font-size', 9)
      .text(`C${c.id + 1}  n=${c.size}`);
    legG.append('text').attr('x', 14).attr('y', ly + 19)
      .attr('fill', '#6a6e80').attr('font-size', 8)
      .text(_clusterProfile(c));
    legG.append('text').attr('x', 14).attr('y', ly + 28)
      .attr('fill', '#4a4e60').attr('font-size', 7.5)
      .text(c.top_category.slice(0, 12));
  });
}

/** Apply highlight/fade to dots (called from index.js). */
export function highlightKMeans(ids) {
  if (!_dots) return;
  if (!ids) {
    _dots.classed('faded', false).classed('highlighted', false);
    return;
  }
  _dots
    .classed('faded',       d => !ids.has(d.id))
    .classed('highlighted', d =>  ids.has(d.id));
}
