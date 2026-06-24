/**
 * bubble_matrix.js – Bubble scatter (Playtime × Rating, size = #Mechanics)
 */

import * as d3 from 'd3';

let _circles;

export function drawBubbleMatrix(container, data, colorScale, onSelect) {
  const el = document.getElementById(container);
  if (!el) return;
  el.innerHTML = '';

  const W = el.clientWidth  || 500;
  const H = el.clientHeight || 300;
  const m = { top: 20, right: 20, bottom: 40, left: 45 };
  const w = W - m.left - m.right;
  const h = H - m.top  - m.bottom;

  const svg = d3.select(`#${container}`).append('svg')
    .attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  const xScale = d3.scaleLinear().domain(d3.extent(data, d => d.x)).range([0, w]).nice();
  const yScale = d3.scaleLinear().domain(d3.extent(data, d => d.y)).range([h, 0]).nice();
  const rScale = d3.scaleSqrt().domain([0, d3.max(data, d => d.size)]).range([3, 14]);

  // Grid
  g.append('g').attr('class', 'km-axis').call(
    d3.axisLeft(yScale).ticks(5).tickSize(-w)).selectAll('line').attr('stroke', '#2c2f3e');
  g.append('g').attr('class', 'km-axis').attr('transform', `translate(0,${h})`).call(
    d3.axisBottom(xScale).ticks(5).tickSize(-h)).selectAll('line').attr('stroke', '#2c2f3e');

  // Axis labels
  g.append('text').attr('x', w/2).attr('y', h+34).attr('text-anchor','middle')
    .attr('fill','#7a7f98').attr('font-size',10).text('Avg Playtime (min)');
  g.append('text').attr('transform','rotate(-90)').attr('x',-h/2).attr('y',-36)
    .attr('text-anchor','middle').attr('fill','#7a7f98').attr('font-size',10).text('Rating');

  // Tooltip
  const tooltip = d3.select('#tooltip');

  _circles = g.selectAll('circle')
    .data(data)
    .join('circle')
    .attr('class', 'bubble-dot')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r',  d => rScale(d.size))
    .attr('fill', d => colorScale(d.category))
    .attr('fill-opacity', .75)
    .attr('stroke', '#1a1d27')
    .attr('stroke-width', .8)
    .style('cursor', 'pointer')
    .on('mouseover', (event, d) => {
      tooltip.classed('visible', true).html(
        `<strong>${d.title}</strong>Rank: #${d.rank}<br>Rating: ${d.y.toFixed(2)}<br>Playtime: ${d.x} min<br>Mechanics: ${d.size}`
      );
    })
    .on('mousemove', event => {
      tooltip.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px');
    })
    .on('mouseleave', () => tooltip.classed('visible', false))
    .on('click', (_, d) => onSelect && onSelect(d.id));
}

export function highlightBubble(highlightIds) {
  if (!_circles) return;
  if (!highlightIds) {
    _circles.classed('faded', false).classed('highlighted', false);
    return;
  }
  _circles
    .classed('faded', d => !highlightIds.has(d.id))
    .classed('highlighted', d => highlightIds.has(d.id));
}

export function filterBubble(selectedIds) {
  if (!_circles) return;
  if (!selectedIds) {
    _circles.classed('faded', false);
    return;
  }
  _circles.classed('faded', d => !selectedIds.has(d.id));
}
