const MAP_WIDTH = 1000;
const MAP_HEIGHT = 1003;

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
  playerList: document.querySelector('#playerList'),
  playerTemplate: document.querySelector('#playerTemplate'),
  searchInput: document.querySelector('#searchInput'),
  manualInput: document.querySelector('#manualInput'),
  applyButton: document.querySelector('#applyButton'),
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

function parseCoordinateValue(value) {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseManualInput(text) {
  const parts = String(text || '')
    .split(/[,\s]+/)
    .map((item) => parseCoordinateValue(item))
    .filter((item) => Number.isFinite(item));

  if (parts.length < 2) return null;

  return {
    x: parts[0],
    y: parts[1],
    z: parts[2] ?? 0
  };
}

function formatManualInput(coord) {
  return `${Math.round(coord.x)}, ${Math.round(coord.y)}, ${Math.round(coord.z ?? 0)}`;
}

function gameToMap(gx, gy, clampToBounds = true) {
  const latLongMode = Math.abs(gx) < 2500 && Math.abs(gy) < 2500;
  const vX = latLongMode ? gx : gx / 1000;
  const vY = latLongMode ? gy : gy / 1000;
  const mapX = ((vY + 505) / 1112) * MAP_WIDTH;
  const mapY = ((vX + 607) / 1116) * MAP_HEIGHT;

  return {
    x: clampToBounds ? clamp(mapX, 0, MAP_WIDTH) : mapX,
    y: clampToBounds ? clamp(mapY, 0, MAP_HEIGHT) : mapY
  };
}

function mapToGame(point) {
  return {
    x: ((point.y / MAP_HEIGHT) * 1116 - 607) * 1000,
    y: ((point.x / MAP_WIDTH) * 1112 - 505) * 1000,
    z: 0
  };
}

function mapEventToPoint(event) {
  const rect = els.mapSvg.getBoundingClientRect();
  const x = clamp(((event.clientX - rect.left) / rect.width) * MAP_WIDTH, 0, MAP_WIDTH);
  const y = clamp(((event.clientY - rect.top) / rect.height) * MAP_HEIGHT, 0, MAP_HEIGHT);
  return { x, y };
}

function normalisePercent(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return value * 100;
  return value;
}

function isVisible(player) {
  const search = state.search.trim().toLowerCase();
  if (!search) return true;
  const haystack = [player.name, player.className, player.id].join(' ').toLowerCase();
  return haystack.includes(search);
}

function speciesPalette(className) {
  const key = String(className || '').toLowerCase();
  if (key.includes('cerato') || key.includes('carno') || key.includes('deino') || key.includes('omni')) {
    return 'rgba(255, 77, 77, 1)';
  }
  if (key.includes('trike') || key.includes('pachy') || key.includes('stego') || key.includes('tenonto')) {
    return 'rgba(255, 77, 77, 1)';
  }
  if (key.includes('ptero') || key.includes('hypso')) {
    return 'rgba(255, 77, 77, 1)';
  }
  return 'rgba(255, 77, 77, 1)';
}

function setStatus(ok) {
  if (ok) {
    els.statusText.textContent = 'online';
    els.statusText.style.color = '#dff6d3';
    return;
  }

  els.statusText.textContent = 'Sem dados';
  els.statusText.style.color = '#f28b82';
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

    node.addEventListener('click', () => {
      state.selectedId = player.id;
      state.selectedCoord = { x: player.x, y: player.y, z: player.z };
      els.manualInput.value = formatManualInput(state.selectedCoord);
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

  state.filteredPlayers
    .filter((player) => Number.isFinite(player.x) && Number.isFinite(player.y))
    .forEach((player, index) => {
    const point = gameToMap(player.x, player.y);
    const isSelected = selected ? player.id === selected.id : index === 0;

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', point.x);
    ring.setAttribute('cy', point.y);
    ring.setAttribute('r', isSelected ? '22' : '18');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', isSelected ? 'rgba(225, 193, 92, 0.42)' : 'rgba(255, 77, 77, 0.34)');
    ring.setAttribute('stroke-width', isSelected ? '4' : '3');
    els.markerLayer.appendChild(ring);

    const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pulse.setAttribute('cx', point.x);
    pulse.setAttribute('cy', point.y);
    pulse.setAttribute('r', isSelected ? '9' : '7');
    pulse.setAttribute('fill', speciesPalette(player.className));
    pulse.setAttribute('stroke', isSelected ? 'rgba(255, 225, 122, 0.95)' : 'rgba(255, 255, 255, 0.9)');
    pulse.setAttribute('stroke-width', '2');
    pulse.classList.add('map-point');
    if (isSelected) pulse.classList.add('selected-pin');
    pulse.addEventListener('click', () => {
      state.selectedId = player.id;
      state.selectedCoord = { x: player.x, y: player.y, z: player.z };
      els.manualInput.value = formatManualInput(state.selectedCoord);
      renderAll();
    });
    els.markerLayer.appendChild(pulse);
    });

  if (selectedCoord) {
    const point = gameToMap(selectedCoord.x, selectedCoord.y);
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cross.innerHTML = `
      <circle cx="${point.x}" cy="${point.y}" r="16" fill="rgba(225, 193, 92, 0.08)" stroke="rgba(225, 193, 92, 0.95)" stroke-width="2"></circle>
      <path d="M ${point.x - 24} ${point.y} H ${point.x + 24}" stroke="rgba(225, 193, 92, 0.9)" stroke-width="2"></path>
      <path d="M ${point.x} ${point.y - 24} V ${point.y + 24}" stroke="rgba(225, 193, 92, 0.9)" stroke-width="2"></path>
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
    const configRes = state.config ? null : await fetch('/api/config').then((res) => res.json());
    if (!state.config && configRes) {
      state.config = configRes;
      els.rconHost.textContent = configRes.rconHost;
      els.rconPort.textContent = String(configRes.rconPort);
      els.statusText.textContent = configRes.rconConfigured ? 'Conectando...' : 'RCON nao configurado';
    }

    const payload = await fetch('/api/state').then((res) => res.json());
    state.players = Array.isArray(payload.players) ? payload.players : [];
    state.server = payload.server || null;
    state.error = payload.ok ? null : payload.error;
    state.updatedAt = payload.updatedAt || new Date().toISOString();
    setStatus(payload.ok);
    renderAll();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    setStatus(false);
  }
}

function seedFallback() {
  state.players = [];
  state.updatedAt = new Date().toISOString();
  els.statusText.textContent = 'Conectando...';
  renderAll();
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
  if (event.key !== 'Enter') return;
  const coord = parseManualInput(els.manualInput.value);
  if (!coord) return;
  state.selectedCoord = coord;
  state.selectedId = null;
  renderAll();
});

els.mapSvg.addEventListener('click', (event) => {
  const point = mapEventToPoint(event);
  const coord = mapToGame(point);
  state.selectedCoord = coord;
  state.selectedId = null;
  els.manualInput.value = formatManualInput(coord);
  renderAll();
});

els.mapSvg.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  state.selectedId = null;
  state.selectedCoord = null;
  els.manualInput.value = '';
  renderAll();
});

seedFallback();
refresh();
setInterval(refresh, 4000);

window.addEventListener('resize', renderMap);
