/**
 * pagerank_graph.js – Force-directed recommendation graph with PageRank significance (Task 3)
 *
 * Design:
 *  - Nodes = boardgames; node radius ∝ PageRank score (significance)
 *  - Edges = fans_liked recommendation (directed, shown as arrows)
 *  - Top-10 PageRank nodes highlighted with gold ring + label always visible
 *  - Clicking a top node shows its "recommendees" (games that recommend it) highlighted
 *  - Color by category (consistent palette)
 *  - Zoom + pan enabled
 *
 * Analytic task: Describe/Locate/Correlate which features (rating, category, mechanics)
 * correlate with a game being a key node (high PageRank) in the recommendation network.
 */

import * as d3 from 'd3';

let _nodeSelection, _linkSelection, _simulation;
let _topIds        = new Set();
let _selectedId    = null;
let _recIds        = new Set();

const TOP_N = 10;

export function drawPageRankGraph(container, pr_nodes, pr_edges, top_games, colorScale, onSelect) {
  const el = document.getElementById(container);
  if (!el) return;
  el.innerHTML = '';

  if (!pr_nodes || pr_nodes.length === 0) {
    el.innerHTML = '<p style="color:#7a7f98;padding:20px">No graph data.</p>';
    return;
  }

  const W = el.clientWidth  || 500;
  const H = el.clientHeight || 300;

  const svg = d3.select(`#${container}`).append('svg')
    .attr('width', W).attr('height', H);

  // Zoom layer
  const zoomG = svg.append('g');
  svg.call(d3.zoom().scaleExtent([.2, 4]).on('zoom', e => zoomG.attr('transform', e.transform)));

  // Arrow marker
  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -4 8 8').attr('refX', 14).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#3a3f55');

  _topIds = new Set(top_games.map(g => g.id));
  _selectedId = null;
  _recIds = new Set();
  const topIds = _topIds;
  const nodeById = Object.fromEntries(pr_nodes.map(n => [n.id, n]));

  // Radius scale
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(pr_nodes, d => d.pr_norm)])
    .range([3, 18]);

  // Build simulation nodes/links
  const simNodes = pr_nodes.map(n => ({ ...n }));
  const simLinks = pr_edges
    .filter(e => nodeById[e.source] && nodeById[e.target])
    .map(e => ({ source: e.source, target: e.target }));

  // Links
  _linkSelection = zoomG.append('g').selectAll('line.pr-link')
    .data(simLinks)
    .join('line')
    .attr('class', 'pr-link')
    .attr('marker-end', 'url(#arrow)');

  // Nodes
  _nodeSelection = zoomG.append('g').selectAll('circle.pr-node')
    .data(simNodes)
    .join('circle')
    .attr('class', 'pr-node')
    .attr('r', d => rScale(d.pr_norm))
    .attr('fill', d => colorScale(d.category_primary))
    .attr('fill-opacity', .85)
    .attr('stroke', d => topIds.has(d.id) ? '#f5c518' : '#1a1d27')
    .attr('stroke-width', d => topIds.has(d.id) ? 2.5 : .8)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) _simulation.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end',   (event, d) => { if (!event.active) _simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('click', (_, d) => onSelect && onSelect(Number(d.id)));

  // Labels for top-10
  const labelG = zoomG.append('g');
  labelG.selectAll('text')
    .data(simNodes.filter(d => topIds.has(d.id)))
    .join('text')
    .attr('font-size', 9)
    .attr('fill', '#e2e4ed')
    .attr('text-anchor', 'middle')
    .attr('dy', d => -rScale(d.pr_norm) - 3)
    .text(d => d.title.slice(0, 16));

  // Tooltip
  const tooltip = d3.select('#tooltip');
  _nodeSelection
    .on('mouseover', (event, d) => {
      tooltip.classed('visible', true).html(
        `<strong>${d.title}</strong>` +
        `PageRank: ${d.pr_score.toFixed(4)}<br>` +
        `Rank: #${d.rank}<br>` +
        `Rating: ${d.rating_value.toFixed(2)}<br>` +
        `Category: ${d.category_primary}<br>` +
        `Mechanics: ${d.num_mechanics}<br>` +
        `Out-links: ${d.out_degree}`
      );
    })
    .on('mousemove', event => {
      tooltip.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px');
    })
    .on('mouseleave', () => tooltip.classed('visible', false));

  // Force simulation
  _simulation = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d => d.id).distance(55).strength(.4))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => rScale(d.pr_norm) + 3))
    .on('tick', () => {
      _linkSelection
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      _nodeSelection
        .attr('cx', d => d.x).attr('cy', d => d.y);
      labelG.selectAll('text')
        .attr('x', d => d.x).attr('y', d => d.y);
    });
}

export function highlightPageRank(highlightIds) {
  if (!_nodeSelection) return;
  if (!highlightIds) {
    _nodeSelection.classed('faded', false).classed('highlighted', false);
    _linkSelection.classed('highlight-link', false);
    _applySelectionStyles();
    return;
  }
  _nodeSelection
    .classed('faded', d => !highlightIds.has(Number(d.id)))
    .classed('highlighted', d => highlightIds.has(Number(d.id)));

  _linkSelection.classed('highlight-link', d =>
    highlightIds.has(Number(d.source.id || d.source)) &&
    highlightIds.has(Number(d.target.id || d.target))
  );
  _applySelectionStyles();
}

/** Visually distinguish the selected node (gold) from its direct recommendees (teal). */
export function selectPageRankNode(selectedId, recIds) {
  _selectedId = selectedId != null ? String(selectedId) : null;
  _recIds     = recIds ? new Set([...recIds].map(String)) : new Set();
  _applySelectionStyles();
}

function _applySelectionStyles() {
  if (!_nodeSelection) return;
  _nodeSelection
    .attr('stroke', d => {
      if (_selectedId && d.id === _selectedId)  return '#fbbf24';
      if (_selectedId && _recIds.has(d.id))      return '#38bdf8';
      return _topIds.has(d.id) ? '#f5c518' : '#1a1d27';
    })
    .attr('stroke-width', d => {
      if (_selectedId && d.id === _selectedId)  return 4;
      if (_selectedId && _recIds.has(d.id))      return 2.5;
      return _topIds.has(d.id) ? 2.5 : 0.8;
    });
}
