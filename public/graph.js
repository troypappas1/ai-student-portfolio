(function () {
  const dataEl = document.getElementById('graph-data');
  const container = document.getElementById('graph-container');
  if (!dataEl || !container) return;

  const graph = JSON.parse(dataEl.textContent);
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  if (nodes.length === 0) return;

  const width = container.clientWidth || 700;
  const height = Math.max(420, Math.min(640, nodes.length * 70));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Diagram of connections between portfolio artifacts');

  const YEAR_COLORS = ['#2a4030', '#a7562f', '#4a6b8a', '#8a6a2f', '#6a4a8a'];
  const years = Array.from(new Set(nodes.map((n) => n.year))).sort();
  const colorFor = (year) => YEAR_COLORS[years.indexOf(year) % YEAR_COLORS.length];

  // Deterministic-ish force simulation: repulsion between all nodes, spring
  // attraction along edges, mild gravity toward center. Runs once on load;
  // this is a static diagram, not a draggable one.
  const idIndex = {};
  nodes.forEach((n, i) => {
    idIndex[n.id] = i;
    const angle = (i / nodes.length) * Math.PI * 2;
    n.x = width / 2 + Math.cos(angle) * (Math.min(width, height) / 3);
    n.y = height / 2 + Math.sin(angle) * (Math.min(width, height) / 3);
    n.vx = 0;
    n.vy = 0;
  });

  for (let iter = 0; iter < 250; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 2200 / (dist * dist);
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }
    edges.forEach((e) => {
      const a = nodes[idIndex[e.from]];
      const b = nodes[idIndex[e.to]];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 160) * 0.02;
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });
    nodes.forEach((n) => {
      n.vx += (width / 2 - n.x) * 0.002;
      n.vy += (height / 2 - n.y) * 0.002;
      n.x += n.vx * 0.12;
      n.y += n.vy * 0.12;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x = Math.max(50, Math.min(width - 50, n.x));
      n.y = Math.max(40, Math.min(height - 40, n.y));
    });
  }

  const edgeEls = [];
  edges.forEach((e) => {
    const a = nodes[idIndex[e.from]];
    const b = nodes[idIndex[e.to]];
    if (!a || !b) return;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', 'graph-edge');
    line.setAttribute('data-from', e.from);
    line.setAttribute('data-to', e.to);
    svg.appendChild(line);
    edgeEls.push({ el: line, from: e.from, to: e.to, label: e.label });
  });

  const tooltip = document.getElementById('graph-tooltip');

  nodes.forEach((n) => {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'graph-node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${n.title}, ${n.year}. ${n.summary || ''}`);

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', 14);
    circle.setAttribute('fill', colorFor(n.year));
    g.appendChild(circle);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', n.x);
    label.setAttribute('y', n.y + 28);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'graph-label');
    label.textContent = n.title.length > 22 ? n.title.slice(0, 20) + '…' : n.title;
    g.appendChild(label);

    function activate() {
      if (!tooltip) return;
      tooltip.hidden = false;
      tooltip.innerHTML =
        `<strong>${n.title}</strong><br>` +
        `<span class="muted">${n.year} · ${n.context || 'Personal project'}</span>` +
        (n.summary ? `<p>${n.summary}</p>` : '');
      edgeEls.forEach(({ el, from, to }) => {
        el.classList.toggle('graph-edge-active', from === n.id || to === n.id);
      });
    }
    function deactivate() {
      if (!tooltip) return;
      tooltip.hidden = true;
      edgeEls.forEach(({ el }) => el.classList.remove('graph-edge-active'));
    }

    g.addEventListener('mouseenter', activate);
    g.addEventListener('mouseleave', deactivate);
    g.addEventListener('focus', activate);
    g.addEventListener('blur', deactivate);
    g.addEventListener('click', activate);

    svg.appendChild(g);
  });

  container.innerHTML = '';
  container.appendChild(svg);
  if (tooltip) container.appendChild(tooltip);
})();
