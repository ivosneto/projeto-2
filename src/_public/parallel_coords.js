/**
 * parallel_coords.js – Parallel Coordinates with per-axis brush (Project 1 view).
 * Reacts to global highlight state.
 */

import * as d3 from 'd3';

const DIMS = ['rating', 'playtime', 'minplayers', 'maxplayers', 'minage', 'mechanics'];
const DIM_LABELS = {
  rating: 'Rating', playtime: 'Playtime', minplayers: 'Min Players',
  maxplayers: 'Max Players', minage: 'Min Age', mechanics: '#Mechanics',
};

let _svg, _lines, _yScales, _xScale, _data = [], _brushFilters = {};
let _onBrush = () => {};

export function drawParallelCoords(container, data, colorScale, onBrush) {
  _data = data;
  _onBrush = onBrush;
  _brushFilters = {};

  const el = document.getElementById(container);
  if (!el) return;
  el.innerHTML = '';

  const W = el.clientWidth  || 500;
  const H = el.clientHeight || 300;
  const margin = { top: 30, right: 20, bottom: 10, left: 20 };
  const w = W - margin.left - margin.right;
  const h = H - margin.top  - margin.bottom;

  _svg = d3.select(`#${container}`).append('svg')
    .attr('width', W).attr('height', H);

  const g = _svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  _xScale = d3.scalePoint().domain(DIMS).range([0, w]).padding(.1);

  _yScales = {};
  for (const dim of DIMS) {
    const ext = d3.extent(data, d => d[dim]);
    _yScales[dim] = d3.scaleLinear().domain(ext).range([h, 0]).nice();
  }

  // Path generator
  function path(d) {
    return d3.line()(DIMS.map(dim => [_xScale(dim), _yScales[dim](d[dim])]));
  }

  // Lines
  _lines = g.append('g').selectAll('path')
    .data(data)
    .join('path')
    .attr('class', 'pc-line')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', d => colorScale(d.category))
    .attr('stroke-width', 1.2)
    .attr('opacity', .6);

  // Axes + brushes
  for (const dim of DIMS) {
    const ax = g.append('g')
      .attr('class', 'pc-axis')
      .attr('transform', `translate(${_xScale(dim)},0)`);

    ax.call(d3.axisLeft(_yScales[dim]).ticks(5));

    ax.append('text')
      .attr('y', -8).attr('text-anchor', 'middle')
      .attr('fill', '#7a7f98').attr('font-size', 10)
      .text(DIM_LABELS[dim]);

    // Per-axis brush
    const brushHeight = h;
    const brush = d3.brushY()
      .extent([[-8, 0], [8, brushHeight]])
      .on('brush end', ({ selection }) => {
        if (selection) {
          const [y1, y2] = selection.map(_yScales[dim].invert);
          _brushFilters[dim] = [Math.min(y1, y2), Math.max(y1, y2)];
        } else {
          delete _brushFilters[dim];
        }
        _applyBrush();
      });

    ax.append('g').attr('class', 'pc-brush').call(brush);
  }
}

function _applyBrush() {
  const dims = Object.keys(_brushFilters);
  const selected = _data.filter(d =>
    dims.every(dim => {
      const [lo, hi] = _brushFilters[dim];
      return d[dim] >= lo && d[dim] <= hi;
    })
  );
  const selectedIds = new Set(selected.map(d => d.id));

  _lines
    .attr('opacity', d => dims.length === 0 || selectedIds.has(d.id) ? 0.6 : 0.06)
    .classed('faded', d => dims.length > 0 && !selectedIds.has(d.id));

  _onBrush(dims.length > 0 ? selectedIds : null);
}

/**
 * React to external highlight (from k-means / pagerank selection).
 * @param {Set|null} highlightIds
 */
export function highlightPC(highlightIds) {
  if (!_lines) return;
  if (!highlightIds) {
    _lines.attr('opacity', .6).classed('faded', false).classed('highlighted', false);
    return;
  }
  _lines
    .classed('faded', d => !highlightIds.has(d.id))
    .classed('highlighted', d => highlightIds.has(d.id))
    .attr('opacity', d => highlightIds.has(d.id) ? 0.9 : 0.06);
}
