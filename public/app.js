const WORLD_BOUNDS = {
  min: -320000,
  max: 320000
};

const state = {
  players: [],
  filteredPlayers: [],
  selectedId: null,
  selectedCoord: null,
  search: '',
  config: null,
  server: null,
  error: null,
  updatedAt: null
};

const els = {
  statusText: document.querySelector('#statusText'),
  playerCount: document.querySelector('#playerCount'),
  visibleCount: document.querySelector('#visibleCount'),
  updatedAt: document.querySelector('#updatedAt'),
  errorText: document.querySelector('#errorText'),
  playerList: document.querySelector('#playerList'),
  playerTemplate: document.querySelector('#playerTemplate'),
  searchInput: document.querySelector('#searchInput'),
  manualInput: document.querySelector('#manualInput'),
  applyButton: document.querySelector('#applyButton'),
  rconHost: document.querySelector('#rconHost'),
  rconPort: document.querySelector('#rconPort'),
  mapSvg: document.querySelector('#mapSvg'),
  markerLayer: document.querySelector('#markerLayer'),
  labelLayer: document.querySelector('#labelLayer'),
  poiLayer: document.querySelector('#poiLayer')
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(iso) {
  if (!iso) return '--:--:--';
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour12: false });
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function mapToSvg(coord) {
  const min = WORLD_BOUNDS.min;
  const max = WORLD_BOUNDS.max;
  const range = max - min;
  const lon = coord.y;
  const lat = coord.x;
  const x = ((lon - min) / range) * 1200;
  const y = (1 - (lat - min) / range) * 980;
  return {
    x: clamp(x, 0, 1200),
    y: clamp(y, 0, 980)
  };
}

function normalisePercent(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return value * 100;
  return value;
}

function parseManualInput(text) {
  const parts = text
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number);

  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;

  return {
    x: parts[0],
    y: parts[1],
    z: parts[2] ?? 0
  };
}

function isVisible(player) {
  const search = state.search.trim().toLowerCase();
  if (!search) return true;
  const haystack = [player.name, player.className, player.id].join(' ').toLowerCase();
  return haystack.includes(search);
}

function speciesPalette(className) {
  const key = className.toLowerCase();
  if (key.includes('cerato') || key.includes('carno') || key.includes('deino') || key.includes('omni')) {
    return 'rgba(225, 193, 92, 0.95)';
  }
  if (key.includes('trike') || key.includes('pachy') || key.includes('stego') || key.includes('tenonto')) {
    return 'rgba(143, 195, 107, 0.95)';
  }
  if (key.includes('ptero') || key.includes('hypso')) {
    return 'rgba(125, 193, 243, 0.95)';
  }
  return 'rgba(231, 241, 222, 0.92)';
}

function applyConfig(config) {
  if (!config) return;
  const min = Number(config.mapMinCoord);
  const max = Number(config.mapMaxCoord);
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
    WORLD_BOUNDS.min = min;
    WORLD_BOUNDS.max = max;
  }
}

function setStatus(ok, error) {
  if (ok) {
    els.statusText.textContent = 'RCON online';
    els.statusText.style.color = '#dff6d3';
    els.errorText.textContent = 'Conexão ativa com o servidor.';
    return;
  }

  els.statusText.textContent = 'Sem conexão';
  els.statusText.style.color = '#f28b82';
  els.errorText.textContent =
    error || 'Não foi possível falar com o RCON. Confira host, porta, senha e reinicie o servidor se mudar os parâmetros.';
}

function renderRoster() {
  const visible = state.players.filter(isVisible);
  state.filteredPlayers = visible;
  els.playerCount.textContent = String(state.players.length);
  els.visibleCount.textContent = `${visible.length} visiveis`;
  els.playerList.innerHTML = '';

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = state.players.length ? 'Nenhum jogador coincide com o filtro.' : 'Aguardando dados do servidor.';
    els.playerList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const template = els.playerTemplate;

  visible.forEach((player) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle('is-selected', player.id === state.selectedId);
    node.querySelector('.player-name').textContent = player.name || 'Sem nome';
    node.querySelector('.player-class').textContent = player.className || 'Unknown';
    node.querySelector('.player-id').textContent = player.id;
    node.querySelector('.player-coords').textContent =
      `Lat ${formatNumber(player.x)} | Long ${formatNumber(player.y)} | Alt ${formatNumber(player.z)}`;

    const growth = node.querySelector('.fill.growth');
    const health = node.querySelector('.fill.health');
    growth.style.width = `${clamp(normalisePercent(player.growth), 0, 100)}%`;
    health.style.width = `${clamp(normalisePercent(player.health), 0, 100)}%`;

    node.addEventListener('click', () => {
      state.selectedId = player.id;
      state.selectedCoord = { x: player.x, y: player.y, z: player.z };
      els.manualInput.value = `${player.x.toFixed(3)}, ${player.y.toFixed(3)}, ${player.z.toFixed(3)}`;
      renderAll();
    });

    fragment.appendChild(node);
  });

  els.playerList.appendChild(fragment);
}

function renderMap() {
  const selected = state.players.find((player) => player.id === state.selectedId) || null;
  const selectedCoord = state.selectedCoord || (selected ? { x: selected.x, y: selected.y, z: selected.z } : null);

  els.markerLayer.innerHTML = '';
  els.labelLayer.innerHTML = '';
  els.poiLayer.innerHTML = '';

  const poiData = [
    { x: -248000, y: -98000, name: 'West ridge' },
    { x: -84000, y: 122000, name: 'Salt flats' },
    { x: 76000, y: -118000, name: 'North marsh' },
    { x: 178000, y: 162000, name: 'South basin' }
  ];

  for (const poi of poiData) {
    const point = mapToSvg(poi);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', point.x);
    circle.setAttribute('cy', point.y);
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', 'rgba(125, 193, 243, 0.85)');
    circle.setAttribute('opacity', '0.9');
    els.poiLayer.appendChild(circle);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', point.x + 14);
    label.setAttribute('y', point.y - 10);
    label.classList.add('map-tag');
    label.textContent = poi.name;
    els.poiLayer.appendChild(label);
  }

  state.filteredPlayers.forEach((player, index) => {
    const point = mapToSvg(player);
    const isSelected = selected ? player.id === selected.id : index === 0;
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', point.x);
    ring.setAttribute('cy', point.y);
    ring.setAttribute('r', isSelected ? '26' : '20');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', isSelected ? 'rgba(225, 193, 92, 0.45)' : 'rgba(143, 195, 107, 0.28)');
    ring.setAttribute('stroke-width', isSelected ? '4' : '3');
    els.markerLayer.appendChild(ring);

    const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pulse.setAttribute('cx', point.x);
    pulse.setAttribute('cy', point.y);
    pulse.setAttribute('r', isSelected ? '8' : '6');
    pulse.setAttribute('fill', speciesPalette(player.className));
    pulse.classList.add('map-point');
    if (isSelected) pulse.classList.add('selected-pin');
    pulse.addEventListener('click', () => {
      state.selectedId = player.id;
      state.selectedCoord = { x: player.x, y: player.y, z: player.z };
      els.manualInput.value = `${player.x.toFixed(3)}, ${player.y.toFixed(3)}, ${player.z.toFixed(3)}`;
      renderAll();
    });
    els.markerLayer.appendChild(pulse);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', point.x + 12);
    label.setAttribute('y', point.y - 14);
    label.classList.add('map-label');
    label.textContent = player.name;
    els.labelLayer.appendChild(label);
  });

  if (selectedCoord) {
    const point = mapToSvg(selectedCoord);
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cross.innerHTML = `
      <circle cx="${point.x}" cy="${point.y}" r="18" fill="rgba(225, 193, 92, 0.08)" stroke="rgba(225, 193, 92, 0.85)" stroke-width="2"></circle>
      <path d="M ${point.x - 28} ${point.y} H ${point.x + 28}" stroke="rgba(225, 193, 92, 0.75)" stroke-width="2"></path>
      <path d="M ${point.x} ${point.y - 28} V ${point.y + 28}" stroke="rgba(225, 193, 92, 0.75)" stroke-width="2"></path>
    `;
    els.markerLayer.appendChild(cross);
  }
}

function renderAll() {
  renderRoster();
  renderMap();
  els.updatedAt.textContent = formatTime(state.updatedAt);
}

async function refresh() {
  try {
    const [configRes, stateRes] = await Promise.all([
      state.config ? Promise.resolve(null) : fetch('/api/config').then((res) => res.json()),
      fetch('/api/state')
    ]);

    if (!state.config && configRes) {
      state.config = configRes;
      applyConfig(configRes);
      els.rconHost.textContent = configRes.rconHost;
      els.rconPort.textContent = String(configRes.rconPort);
      els.statusText.textContent = configRes.rconConfigured ? 'Conectando...' : 'RCON não configurado';
    }

    const payload = await stateRes.json();
    state.players = Array.isArray(payload.players) ? payload.players : [];
    state.server = payload.server || null;
    state.error = payload.ok ? null : payload.error;
    state.updatedAt = payload.updatedAt || new Date().toISOString();
    applyConfig(state.config);
    setStatus(payload.ok, payload.error);
    renderAll();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    setStatus(false, state.error);
  }
}

els.searchInput.addEventListener('input', (event) => {
  state.search = event.target.value || '';
  renderAll();
});

els.applyButton.addEventListener('click', () => {
  const coord = parseManualInput(els.manualInput.value);
  if (!coord) return;
  state.selectedCoord = coord;
  state.selectedId = null;
  renderAll();
});

els.manualInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const coord = parseManualInput(els.manualInput.value);
    if (!coord) return;
    state.selectedCoord = coord;
    state.selectedId = null;
    renderAll();
  }
});

function seedFallback() {
  state.players = [];
  state.updatedAt = new Date().toISOString();
  els.rconHost.textContent = '--';
  els.rconPort.textContent = '--';
  els.statusText.textContent = 'Conectando...';
  renderAll();
}

seedFallback();
refresh();
setInterval(refresh, 4000);

window.addEventListener('resize', renderMap);
