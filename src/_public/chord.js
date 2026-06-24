/**
 * chord.js – Category × Mechanic co-occurrence chord diagram (Project 1 view)
 *
 * Supports linked highlighting: when a set of game IDs is highlighted in any
 * other view, the chord is redrawn using only those games' edges, making the
 * category–mechanic relationships of the selection immediately visible.
 */

import * as d3 from 'd3';

// Module-level state for redraw on highlight
let _container    = null;
let _allEdges     = [];
let _topMechanics = [];
let _colorScale   = null;

export function drawChord(container, chord_edges, top_mechanics, colorScale) {
  _container    = container;
  _allEdges     = chord_edges;
  _topMechanics = top_mechanics;
  _colorScale   = colorScale;
  _render(chord_edges);
}

/** React to external highlight (ids = Set<number> | null). */
export function highlightChord(ids) {
  if (!_container) return;
  if (!ids) {
    _render(_allEdges);
    return;
  }
  const filtered = _allEdges.filter(e => ids.has(e.game_id));
  _render(filtered.length > 0 ? filtered : _allEdges);
}

// ── Internal render ───────────────────────────────────────────────────────────

function _render(edges) {
  const el = document.getElementById(_container);
  if (!el) return;
  el.innerHTML = '';

  if (!edges || edges.length === 0) return;

  const W = el.clientWidth  || 600;
  const H = el.clientHeight || 260;
  const R = Math.min(W, H) / 2 - 60;

  const svg = d3.select(`#${_container}`).append('svg')
    .attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

  // Nodes = categories + mechanics
  const categories = [...new Set(edges.map(e => e.category))];
  const mechanics  = _topMechanics;
  const nodes      = [...categories, ...mechanics];
  const N          = nodes.length;
  if (N === 0) return;

  const catSet = new Set(categories);

  // Build co-occurrence matrix
  const idx    = Object.fromEntries(nodes.map((n, i) => [n, i]));
  const matrix = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const e of edges) {
    const ci = idx[e.category];
    const mi = idx[e.mechanic];
    if (ci !== undefined && mi !== undefined) {
      matrix[ci][mi]++;
      matrix[mi][ci]++;
    }
  }

  const chord   = d3.chord().padAngle(.04).sortSubgroups(d3.descending);
  const chords  = chord(matrix);
  const arc     = d3.arc().innerRadius(R).outerRadius(R + 18);
  const ribbon  = d3.ribbon().radius(R);

  const nodeColor = n => catSet.has(n) ? _colorScale(n) : '#3a3f55';

  const tooltip = d3.select('#tooltip');

  // Groups (arcs)
  const group = g.append('g').selectAll('g')
    .data(chords.groups)
    .join('g');

  group.append('path')
    .attr('d', arc)
    .attr('fill',   d => nodeColor(nodes[d.index]))
    .attr('stroke', '#0f1117')
    .attr('stroke-width', .5)
    .attr('opacity', .85)
    .on('mouseover', (event, d) => {
      tooltip.classed('visible', true)
        .html(`<strong>${nodes[d.index]}</strong>Connections: ${Math.round(d.value)}`);
    })
    .on('mousemove', ev => {
      tooltip.style('left', (ev.clientX + 12) + 'px').style('top', (ev.clientY - 28) + 'px');
    })
    .on('mouseleave', () => tooltip.classed('visible', false));

  group.append('text')
    .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
    .attr('dy', '.35em')
    .attr('transform', d => `
      rotate(${d.angle * 180 / Math.PI - 90})
      translate(${R + 22})
      ${d.angle > Math.PI ? 'rotate(180)' : ''}
    `)
    .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
    .attr('fill', '#e2e4ed')
    .attr('font-size', 9)
    .text(d => nodes[d.index]);

  // Ribbons
  g.append('g').selectAll('path')
    .data(chords)
    .join('path')
    .attr('d', ribbon)
    .attr('fill',         d => nodeColor(nodes[d.source.index]))
    .attr('fill-opacity', .35)
    .attr('stroke',       d => nodeColor(nodes[d.source.index]))
    .attr('stroke-opacity', .2)
    .attr('stroke-width', .5);
}
