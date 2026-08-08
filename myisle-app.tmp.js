const state = {
  view: {
    zoom: 1,
    rotate: 0,
    tilt: 0,
    x: 0,
    y: 0,
    level: "ground",
    opacity: 100
  },
  history: [],
  historyMode: "normal",
  customPins: [],
  sharedMembers: [],
  mode: null,
  measureStart: null
};



const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  stage: $("#mapStage"),
  viewport: $("#mapViewport"),
  pinOverlay: $("#pinOverlay"),
  gridLayer: $("#gridLayer"),
  footstepLayer: $("#footstepLayer"),
  historyList: $("#historyList"),
  hoverCoord: $("#hoverCoord"),
  scaleReadout: $("#scaleReadout"),
  sidebar: $("#sidebar"),
  realMapImage: $("#realMapImage"),
  mapTileLayer: $("#mapTileLayer"),
  mapStatus: $("#mapStatus"),
  overlayZones: $("#overlayZones"),
  overlayResources: $("#overlayResources")
};

function isMobileViewport() {
  return MOBILE_VIEW_QUERY.matches || (navigator.maxTouchPoints > 0 && window.innerWidth <= 1100);
}

function runWhenIdle(callback, timeout = 1000) {
  window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 500 });
      return;
    }
    callback();
  }, timeout);
}

let _overlayPrefsSaveTimer = null;
let _heatmapDrawnAt = 0;
let _heatmapRenderPromise = null;
let _locationBroadcastTimer = null;
let _pendingLocationHistory = null;
let _lastLocationBroadcastAt = 0;
let _lastLocationBroadcastKey = "";
let _viewPersistTimer = null;
let _lastScaleReadout = "";
const MOBILE_VIEW_QUERY = window.matchMedia("(max-width: 980px)");
const OCR_CROP_PREF_KEY = "islemap.ocrCrop.v1";
const MAP_SIZE_PREF_KEY = "islemap.mapSizes.v1";
const ANNOUNCEMENT_STORAGE_PREFIX = "islemap.announcement.";
const PRIME_TRACKER_STORAGE_KEY = "islemap.primeTracker.v1";
const PRIME_PATROL_TARGET = 4;
const PRIME_MIGRATION_TARGET = 2;
const PRIME_MAX_SAVED_RUNS = 10;
const WATER_OVERLAY_PREF_RESET_KEY = "isleMap.waterOverlayReset.20260718hq2";
const MAP_BASE_MAX_WIDTH = 960;
const MAP_BASE_VIEWPORT_HEIGHT_RATIO = 0.94;
const MAP_IMAGE_WIDTH = 7800;
const MAP_IMAGE_HEIGHT = 7817;
const MAP_TILE_SIZE = 1024;
const MAP_TILE_COLS = Math.ceil(MAP_IMAGE_WIDTH / MAP_TILE_SIZE);
const MAP_TILE_ROWS = Math.ceil(MAP_IMAGE_HEIGHT / MAP_TILE_SIZE);
const MAP_TILE_VERSION = "20260728v1";
const USE_LEGACY_MAP_TILES = true;
const OCR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const QR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
const QR_IMAGE_SERVICE_URL = "https://api.qrserver.com/v1/create-qr-code/";
const OCR_PREVIEW_INTERVAL_MS = 1000;
const OCR_CAPTURE_INTERVAL_MS = 4000;
const OCR_BACKUP_INTERVAL_MS = 9000;
const OCR_CANVAS_MAX_WIDTH = 1200;
const OCR_CANVAS_MAX_HEIGHT = 320;
const OCR_CANVAS_MAX_SCALE = 1.75;
const OCR_MAP_EDGE_MARGIN = 20;
const OCR_NEARBY_DISTANCE = 0.25;
const OCR_CONFIRM_DISTANCE = 0.5;
const OCR_CONFIRM_WINDOW_MS = 12000;
const OCR_TESSERACT_PARAMS = {
  tessedit_pageseg_mode: "6",
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.,: /"
};
const QR_EC_CODEWORDS = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const QR_EC_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];
const ocrState = {
  stream: null,
  timer: null,
  previewTimer: null,
  timerWorker: null,
  frameRequest: null,
  imageCapture: null,
  ocrWorker: null,
  ocrWorkerPromise: null,
  wakeLock: null,
  busy: false,
  lastOcrAt: 0,
  lastText: "",
  lastPoint: null,
  pendingPoint: null,
  pendingAt: 0
};
let _ocrLibraryPromise = null;
let _qrLibraryPromise = null;
let _markerResizeFrame = null;
let _primeTimerInterval = null;
const primeTracker = {
  patrol: new Set(),
  migration: new Set(),
  currentlyInside: new Set(),
  entries: [],
  savedRuns: [],
  pendingOverlap: [],
  latestPoint: null,
  routeMode: false,
  routeTargets: [],
  runId: "",
  startedAt: Date.now(),
  completedAt: null,
  latestMessage: "",
  collapsed: false
};

function boot() {
  const mobile = isMobileViewport();
  document.documentElement.classList.toggle("is-mobile-performance", mobile);
  loadPreferences();
  hydrate();
  loadPrimeTracker();
  if (mobile) {
    els.sidebar.classList.remove("is-open");
  }
  let sharedPhonePoint = null;
  // Section
  if (window.location.hash) {
    try {
      const p = new URLSearchParams(window.location.hash.slice(1));
      if (p.has("x")) state.view.x = Number(p.get("x"));
      if (p.has("y")) state.view.y = Number(p.get("y"));
      if (p.has("z")) state.view.zoom = Number(p.get("z"));
      if (p.has("r")) state.view.rotate = Number(p.get("r"));
      if (p.has("l")) state.view.level = p.get("l");
      sharedPhonePoint = restorePhoneLocationFromHash(p);
      if ($("#zoomRange")) $("#zoomRange").value = state.view.zoom;
    } catch {}
  }
  loadRealBasemap();
  renderOverlayFilters();
  renderGrid();
  if (mobile) {
    runWhenIdle(() => renderOverlays(), 700);
  } else {
    renderOverlays();
  }
  renderHistory();
  renderPins();
  const latestTrackedPoint = sharedPhonePoint || state.history[0];
  const latestTrackedAt = trackedPointTimestamp(latestTrackedPoint);
  const shouldProcessTrackedPoint = Boolean(sharedPhonePoint)
    || (latestTrackedPoint && latestTrackedAt >= primeTracker.startedAt);
  if (shouldProcessTrackedPoint) {
    updatePrimeTrackerForPoint(latestTrackedPoint);
  } else {
    renderPrimeTracker();
  }
  startPrimeTrackerTimer();
  if (sharedPhonePoint) {
    centerOn(sharedPhonePoint);
  } else {
    applyView();
  }
  bindAnnouncement();
  bindEvents();
  if (mobile) {
    runWhenIdle(startVisitTracking, 1800);
  } else {
    startVisitTracking();
  }
}


function bindAnnouncement() {
  const banner = $("#mapAnnouncement");
  const dismissButton = $("#mapAnnouncementDismiss");
  if (!banner || !dismissButton) return;

  const id = banner.dataset.announcementId || "default";
  const storageKey = `${ANNOUNCEMENT_STORAGE_PREFIX}${id}`;
  try {
    if (localStorage.getItem(storageKey) === "dismissed") {
      banner.remove();
      return;
    }
  } catch {}

  banner.classList.remove("is-hidden");
  dismissButton.addEventListener("click", () => {
    try {
      localStorage.setItem(storageKey, "dismissed");
    } catch {}
    banner.classList.add("map-announcement-hiding");
    window.setTimeout(() => banner.remove(), 260);
  });
}
function loadRealBasemap() {
  renderMapTiles();
  els.realMapImage.addEventListener("load", () => {
    els.realMapImage.classList.remove("is-hidden");
    els.stage.classList.add("has-real-map");
  });
  els.realMapImage.addEventListener("error", () => {
    els.realMapImage.classList.add("is-hidden");
    els.stage.classList.remove("has-real-map");
  });
  if (els.realMapImage.complete && els.realMapImage.naturalWidth > 0) {
    els.realMapImage.classList.remove("is-hidden");
    els.stage.classList.add("has-real-map");
  }
}

function renderMapTiles() {
  if (!els.mapTileLayer) return;
  if (!USE_LEGACY_MAP_TILES) {
    els.mapTileLayer.replaceChildren();
    els.stage.classList.remove("has-map-tiles");
    return;
  }
  if (els.mapTileLayer.childElementCount) return;

  const fragment = document.createDocumentFragment();
  for (let row = 0; row < MAP_TILE_ROWS; row += 1) {
    for (let col = 0; col < MAP_TILE_COLS; col += 1) {
      const x = col * MAP_TILE_SIZE;
      const y = row * MAP_TILE_SIZE;
      const width = Math.min(MAP_TILE_SIZE, MAP_IMAGE_WIDTH - x);
      const height = Math.min(MAP_TILE_SIZE, MAP_IMAGE_HEIGHT - y);
      const tile = document.createElement("img");
      tile.className = "map-tile";
      tile.src = `assets/gateway-tiles/gateway-${col}-${row}.jpg?v=${MAP_TILE_VERSION}`;
      tile.alt = "";
      tile.decoding = "async";
      tile.loading = row < 2 ? "eager" : "lazy";
      tile.style.left = `${(x / MAP_IMAGE_WIDTH) * 100}%`;
      tile.style.top = `${(y / MAP_IMAGE_HEIGHT) * 100}%`;
      tile.style.width = `${((width + (col < MAP_TILE_COLS - 1 ? 1 : 0)) / MAP_IMAGE_WIDTH) * 100}%`;
      tile.style.height = `${((height + (row < MAP_TILE_ROWS - 1 ? 1 : 0)) / MAP_IMAGE_HEIGHT) * 100}%`;
      fragment.appendChild(tile);
    }
  }

  els.mapTileLayer.appendChild(fragment);
  els.stage.classList.add("has-map-tiles");
}

function renderOverlayFilters() {
  const overlays = window.MAP_OVERLAYS;
  if (!overlays || !overlays.resourceGroups) return;

  [
    ["animals", "subAnimals"],
    ["herbs", "subHerbs"],
    ["earth", "subEarth"]
  ].forEach(([key, containerId]) => {
    const container = document.getElementById(containerId);
    const groups = overlays.resourceGroups[key];
    if (!container || !groups) return;

    container.innerHTML = "";
    groups.forEach((group) => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox" data-sub-overlay="${key}" data-resource-key="${group.key}" checked>
        <span>${group.emoji && group.emoji.endsWith('.svg')
          ? `<img data-filter-icon-src="${escapeHtml(group.emoji)}" alt="" width="16" height="16" loading="lazy" decoding="async" style="vertical-align:middle;margin-right:3px;">`
          : ''
        }${escapeHtml(group.name)} <small>${group.count}</small></span>
      `;
      container.append(label);
    });
  });

  if (isMobileViewport()) {
    runWhenIdle(hydrateFilterIcons, 2200);
  } else {
    hydrateFilterIcons();
  }
}

function hydrateFilterIcons() {
  document.querySelectorAll("img[data-filter-icon-src]").forEach((img) => {
    img.src = img.dataset.filterIconSrc;
    img.removeAttribute("data-filter-icon-src");
  });
}

function hydrate() {
  const saved = readJson("isle-map-state", {});
  Object.assign(state.view, saved.view || {});
  // Section
  state.view.rotate = 0;
  state.view.tilt = 0;
  state.view.opacity = 100;
  state.history = saved.history || [];
  state.customPins = saved.customPins || [];
  state.sharedMembers = saved.sharedMembers || [];

  if ($("#zoomRange")) $("#zoomRange").value = state.view.zoom;
  if ($("#mapOpacity")) $("#mapOpacity").value = state.view.opacity;
}

function bindEvents() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.tab === "display") hydrateFilterIcons();
      activateTab(tab.dataset.tab);
    });
  });

  $("#toggleSidebar").addEventListener("click", () => {
    els.sidebar.classList.toggle("is-open");
    if (els.sidebar.classList.contains("is-open")) hydrateFilterIcons();
  });

  $("#resetView").addEventListener("click", () => {
    Object.assign(state.view, { zoom: 1, rotate: 0, tilt: 0, x: 0, y: 0 });
    syncControls();
    applyView();
  });

  $("#focusLatest").addEventListener("click", focusLatest);
  $("#zoomIn").addEventListener("click", () => setZoom(state.view.zoom + 0.25));
  $("#zoomOut").addEventListener("click", () => setZoom(state.view.zoom - 0.25));
  $("#copyLink").addEventListener("click", copyViewLink);
  if ($("#saveConfig")) $("#saveConfig").addEventListener("click", persist);
  if ($("#clearHistory")) $("#clearHistory").addEventListener("click", () => {
    state.history = [];
    state.measureStart = null;
    const marker = document.getElementById("searchMarker");
    if (marker) marker.remove();
    renderHistory();
    renderPins();
    persist();
    resetPrimeTracker(false);
  });
  if ($("#primeTrackerReset")) {
    $("#primeTrackerReset").addEventListener("click", () => {
      if (!window.confirm("Clear the current Prime Tracker run and all saved runs?")) return;
      resetPrimeTracker(true);
    });
  }
  if ($("#primeTrackerToggle")) {
    $("#primeTrackerToggle").addEventListener("click", () => {
      setPrimeTrackerCollapsed(!primeTracker.collapsed);
    });
  }
  if ($("#primeTrackerUndo")) {
    $("#primeTrackerUndo").addEventListener("click", undoLastPrimeEntry);
  }
  if ($("#primeTrackerNewRun")) {
    $("#primeTrackerNewRun").addEventListener("click", () => {
      if (primeTracker.entries.length && !primeRunComplete()
        && !window.confirm("Start a new run? Current incomplete progress will be cleared.")) return;
      startNewPrimeRun();
    });
  }
  if ($("#primeTrackerRoute")) {
    $("#primeTrackerRoute").addEventListener("click", () => {
      primeTracker.routeMode = !primeTracker.routeMode;
      if (primeTracker.routeMode) {
        [$("#togglePatrol"), $("#toggleMigration")].forEach((control) => {
          if (control) control.checked = true;
        });
        queueOverlayPreferenceSave();
        renderOverlays();
      }
      persistPrimeTracker();
      renderPrimeTracker();
    });
  }
  if ($("#primeOverlapDismiss")) {
    $("#primeOverlapDismiss").addEventListener("click", dismissPrimeOverlap);
  }

  // Section
  const coordInput = $("#coordInput");
  if (coordInput) {
    coordInput.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        const val = event.currentTarget.value.trim();
        if (val) { runLocationSearch(val); event.currentTarget.value = ""; }
      }
    });
    coordInput.addEventListener("focus", () => coordInput.select());
    coordInput.addEventListener("click", () => coordInput.select());
  }
  if ($("#coordSearch")) {
    $("#coordSearch").addEventListener("click", () => {
      const val = $("#coordInput").value.trim();
      if (val) { runLocationSearch(val); $("#coordInput").value = ""; }
    });
  }
  bindPhoneShareControls();
  bindOcrControls();

  const globalSearch = $("#globalSearch");
  if (globalSearch) {
    globalSearch.addEventListener("keyup", (event) => {
      if (event.key === "Enter") {
        runLocationSearch(event.currentTarget.value);
      }
    });
    globalSearch.addEventListener("focus", () => globalSearch.select());
    globalSearch.addEventListener("click", () => globalSearch.select());
  }

  if ($("#gridToggle")) $("#gridToggle").addEventListener("change", renderGrid);
  if ($("#coordToggle")) $("#coordToggle").addEventListener("change", renderGrid);

  if ($("#gridSpacing")) $("#gridSpacing").addEventListener("input", renderGrid);

  if ($("#zoomRange")) $("#zoomRange").addEventListener("input", (event) => setZoom(Number(event.target.value)));

  if ($("#pinFontSize")) {
    $("#pinFontSize").addEventListener("input", (event) => {
      const sz = Number(event.target.value);
      document.documentElement.style.setProperty("--pin-font-size", sz + "px");
      document.documentElement.style.setProperty("--resource-icon-size", (sz * 4.32) + "px");
      document.documentElement.style.setProperty("--map-icon-scale", sz / 5);
    });
    $("#pinFontSize").addEventListener("change", saveMapSizePreference);
  }

  if ($("#markerSize")) {
    $("#markerSize").addEventListener("input", scheduleMarkerResize);
    $("#markerSize").addEventListener("change", saveMapSizePreference);
  }

  const handleOverlayChange = (control) => {
    renderOverlays(control);
    queueOverlayPreferenceSave();
  };

  // Section
  $$("[data-overlay], [id^='toggle']").forEach((cb) => {
    cb.addEventListener("change", (event) => handleOverlayChange(event.currentTarget));
  });

  // Section
  $$(".subcategory-list").forEach((list) => {
    list.addEventListener("change", (event) => {
      if (!event.target.matches("[data-sub-overlay]")) return;
      handleOverlayChange(event.target);
    });
  });

  $$("[data-history-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.historyMode = button.dataset.historyMode;
      $$("[data-history-mode]").forEach((item) => item.classList.toggle("is-selected", item === button));
    });
  });

  bindMapPointer();
}

function bindMapPointer() {
  let dragging = false;
  let start = { x: 0, y: 0 };
  let startView = { x: 0, y: 0 };
  let pendingMove = null;
  let pointerFrame = 0;
  let pinchStart = null;
  let lastTouchFallbackAt = 0;
  const activePointers = new Map();

  const pointerData = (event) => ({
    id: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType || "mouse"
  });

  const getPinchPoints = () => Array.from(activePointers.values())
    .filter((pointer) => pointer.pointerType === "touch")
    .slice(0, 2);

  const getPrimaryPointer = () => Array.from(activePointers.values())[0] || pendingMove;

  const midpoint = (a, b) => ({
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2
  });

  const pointerDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const touchData = (touch) => ({
    id: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
    pointerType: "touch"
  });

  const touchPoints = (touchList) => Array.from(touchList).map(touchData);

  const touchFallbackActive = () => Date.now() - lastTouchFallbackAt < 700;

  const screenPoint = (point) => {
    const rect = els.viewport.getBoundingClientRect();
    return {
      x: point.clientX - rect.left - rect.width / 2,
      y: point.clientY - rect.top - rect.height / 2
    };
  };

  const beginPan = (pointer) => {
    if (!pointer) return;
    dragging = true;
    pinchStart = null;
    start = { x: pointer.clientX, y: pointer.clientY };
    startView = { x: state.view.x, y: state.view.y };
    els.viewport.classList.add("is-dragging");
  };

  const beginPinch = (points = getPinchPoints()) => {
    if (points.length < 2) return;
    const mid = midpoint(points[0], points[1]);
    const screen = screenPoint(mid);
    pinchStart = {
      distance: Math.max(1, pointerDistance(points[0], points[1])),
      zoom: state.view.zoom,
      mapX: (screen.x - state.view.x) / state.view.zoom,
      mapY: (screen.y - state.view.y) / state.view.zoom
    };
    dragging = false;
    els.viewport.classList.add("is-dragging");
  };

  const queuePointerMove = (event) => {
    pendingMove = pointerData(event);
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, pendingMove);
    }
    if (!pointerFrame) {
      pointerFrame = requestAnimationFrame(flushPointerMove);
    }
  };

  const applyPinch = (points = getPinchPoints()) => {
    if (points.length < 2) return false;
    if (!pinchStart) beginPinch(points);
    if (!pinchStart) return false;

    const mid = midpoint(points[0], points[1]);
    const screen = screenPoint(mid);
    const scale = pointerDistance(points[0], points[1]) / pinchStart.distance;
    const newZoom = clamp(pinchStart.zoom * scale, 0.25, 9);
    state.view.x = screen.x - pinchStart.mapX * newZoom;
    state.view.y = screen.y - pinchStart.mapY * newZoom;
    state.view.zoom = newZoom;
    if ($("#zoomRange")) $("#zoomRange").value = newZoom;
    applyView(false);
    return true;
  };

  const flushPointerMove = () => {
    pointerFrame = 0;
    const event = pendingMove;
    pendingMove = null;
    if (!event && activePointers.size === 0) return;

    if (getPinchPoints().length >= 2 && applyPinch()) return;

    if (event && event.pointerType !== "touch" && !isMobileViewport()) {
      const point = clientToMap(event.clientX, event.clientY);
      if (point) {
        els.hoverCoord.textContent = `${formatCoord(point)} | ${nearestGrid(point)}`;
      }
    }

    if (!dragging) return;
    const pointer = event || getPrimaryPointer();
    if (!pointer) return;
    state.view.x = startView.x + pointer.clientX - start.x;
    state.view.y = startView.y + pointer.clientY - start.y;
    applyView(false);
  };

  const finishDrag = (event) => {
    if (event?.pointerId !== undefined && activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, pointerData(event));
    }
    if (pointerFrame) {
      cancelAnimationFrame(pointerFrame);
      flushPointerMove();
    }
    if (event?.pointerId !== undefined) {
      activePointers.delete(event.pointerId);
      try {
        els.viewport.releasePointerCapture(event.pointerId);
      } catch {
        // Section
      }
    }

    if (getPinchPoints().length >= 2) {
      beginPinch();
      return;
    }

    const remaining = getPrimaryPointer();
    if (remaining) {
      beginPan(remaining);
      return;
    }

    dragging = false;
    pinchStart = null;
    pendingMove = null;
    els.viewport.classList.remove("is-dragging");
    persist();
  };

  const markTouchFallback = (event) => {
    lastTouchFallbackAt = Date.now();
    if (event.cancelable) event.preventDefault();
  };

  const queueTouchMove = (touch) => {
    pendingMove = touchData(touch);
    if (!pointerFrame) {
      pointerFrame = requestAnimationFrame(flushPointerMove);
    }
  };

  const finishTouchGesture = (event) => {
    markTouchFallback(event);
    if (pointerFrame) {
      cancelAnimationFrame(pointerFrame);
      flushPointerMove();
    }

    const points = touchPoints(event.touches);
    if (points.length >= 2) {
      beginPinch(points);
      return;
    }
    if (points.length === 1) {
      beginPan(points[0]);
      return;
    }

    dragging = false;
    pinchStart = null;
    pendingMove = null;
    activePointers.clear();
    els.viewport.classList.remove("is-dragging");
    persist();
  };

  els.viewport.addEventListener("touchstart", (event) => {
    if (!event.touches.length) return;
    markTouchFallback(event);
    activePointers.clear();

    const points = touchPoints(event.touches);
    if (points.length >= 2) {
      beginPinch(points);
      return;
    }
    beginPan(points[0]);
  }, { passive: false });

  els.viewport.addEventListener("touchmove", (event) => {
    if (!event.touches.length) return;
    markTouchFallback(event);
    const points = touchPoints(event.touches);

    if (points.length >= 2) {
      if (!pinchStart) beginPinch(points);
      applyPinch(points);
      return;
    }

    if (!dragging) beginPan(points[0]);
    queueTouchMove(event.touches[0]);
  }, { passive: false });

  els.viewport.addEventListener("touchend", finishTouchGesture, { passive: false });
  els.viewport.addEventListener("touchcancel", finishTouchGesture, { passive: false });

  els.viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchFallbackActive()) return;
    if (event.pointerType === "touch") event.preventDefault();
    const point = clientToMap(event.clientX, event.clientY);
    if (state.mode === "measure") {
      measure(point);
      return;
    }
    const pointer = pointerData(event);
    activePointers.set(event.pointerId, pointer);
    try {
      els.viewport.setPointerCapture(event.pointerId);
    } catch {}
    if (getPinchPoints().length >= 2) {
      beginPinch();
      return;
    }
    beginPan(pointer);
  });

  els.viewport.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && touchFallbackActive()) return;
    if (event.pointerType === "touch") event.preventDefault();
    if (!activePointers.has(event.pointerId) && (event.pointerType === "touch" || isMobileViewport())) return;
    queuePointerMove(event);
  });

  els.viewport.addEventListener("pointerup", finishDrag);
  els.viewport.addEventListener("pointercancel", finishDrag);

  const handleViewportResize = () => applyView(false);
  window.addEventListener("resize", handleViewportResize);
  window.visualViewport?.addEventListener("resize", handleViewportResize);

  els.viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey) {
      state.view.rotate = clamp(state.view.rotate + Math.sign(event.deltaY) * 6, -180, 180);
    } else if (event.altKey) {
      state.view.tilt = clamp(state.view.tilt + Math.sign(event.deltaY) * 3, 0, 60);
    } else if (event.shiftKey) {
      cycleLevel(Math.sign(event.deltaY));
    } else {
      const oldZoom = state.view.zoom;
      const newZoom = clamp(oldZoom - Math.sign(event.deltaY) * 0.12, 0.25, 9);

      // Section
      const rect = els.viewport.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - rect.width / 2;
      const mouseY = event.clientY - rect.top - rect.height / 2;

      // Section
      const mapX = (mouseX - state.view.x) / oldZoom;
      const mapY = (mouseY - state.view.y) / oldZoom;

      // Section
      state.view.x = mouseX - mapX * newZoom;
      state.view.y = mouseY - mapY * newZoom;
      state.view.zoom = newZoom;
      $("#zoomRange").value = newZoom;
    }
    syncControls();
    applyView();
  }, { passive: false });
}

function activateTab(id) {
  $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === id));
  $$(".panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === id));
}

function persist() {
  if (_viewPersistTimer) {
    clearTimeout(_viewPersistTimer);
    _viewPersistTimer = null;
  }
  writeJson("isle-map-state", {
    view: state.view,
    history: state.history,
    customPins: state.customPins,
    sharedMembers: state.sharedMembers
  });
}

function queuePersist(delay = 180) {
  if (_viewPersistTimer) clearTimeout(_viewPersistTimer);
  _viewPersistTimer = setTimeout(() => {
    _viewPersistTimer = null;
    persist();
  }, delay);
}

function startVisitTracking() {
  sendVisitPing("load");
  setInterval(() => sendVisitPing("heartbeat"), 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sendVisitPing("heartbeat", true);
  });
}

function analyticsVisitorId() {
  const key = "isleMapVisitorId";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      const random = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      id = `v_${random}`.replace(/[^a-z0-9_-]/gi, "").slice(0, 96);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

function sendVisitPing(event, keepalive = false) {
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  })();
  const body = JSON.stringify({
    event,
    visitorId: analyticsVisitorId(),
    path: location.pathname + location.search,
    referrer: document.referrer || "",
    language: navigator.language || "",
    timezone,
    screen: window.screen ? `${window.screen.width}x${window.screen.height}` : "",
    viewport: `${window.innerWidth}x${window.innerHeight}`
  });

  if (keepalive && navigator.sendBeacon) {
    navigator.sendBeacon("/api/visit-ping", new Blob([body], { type: "application/json" }));
    return;
  }

  fetch("/api/visit-ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive
  }).catch(() => {});
}

function renderGrid() {
  els.gridLayer.innerHTML = "";
  const spacing = 50;
  for (let x = 0; x <= 1000; x += spacing) {
    const line = svg("line", { x1: x, y1: 0, x2: x, y2: 1003, class: x % (spacing * 2) === 0 ? "bold" : "" });
    els.gridLayer.append(line);
    if (x > 0 && x < 1000 && x % (spacing * 2) === 0) {
      els.gridLayer.append(svg("text", { x: x + 6, y: 22 }, gridXName(x, spacing)));
    }
  }
  for (let y = 0; y <= 1003; y += spacing) {
    const line = svg("line", { x1: 0, y1: y, x2: 1000, y2: y, class: y % (spacing * 2) === 0 ? "bold" : "" });
    els.gridLayer.append(line);
    if (y > 0 && y < 1003 && y % (spacing * 2) === 0) {
      els.gridLayer.append(svg("text", { x: 8, y: y - 6 }, gridYName(y, spacing)));
    }
  }
}

// Section
let _overlaysBuilt = false;
let _mobileResourceRenderTimer = null;
let _mobileResourceRenderKey = "";
const RESOURCE_OVERLAY_KEYS = ["animals", "herbs", "earth"];
const MOBILE_RESOURCE_ICON_MIN_ZOOM = 1.1;
const MOBILE_RESOURCE_ICON_LIMIT = 420;
const MOBILE_RESOURCE_RENDER_PADDING_PX = 140;

function formatAISpawnZoneDetails(zone) {
  const configs = Array.isArray(zone?.configs) ? zone.configs : [];
  const lines = configs.map((config) => {
    const minimumDistance = Number(config.minimumDistance);
    const minimumMetres = Number.isFinite(minimumDistance) ? minimumDistance / 100 : null;
    const distanceText = minimumMetres === null
      ? "distance unknown"
      : `${minimumMetres.toLocaleString()}-${(minimumMetres * 2).toLocaleString()} m from selected player`;
    const maximum = Number(config.max);
    const capText = Number.isFinite(maximum) && maximum > 0 ? `cap ${maximum}` : "no authored cap";
    const respawn = Number(config.respawnTime);
    const respawnText = Number.isFinite(respawn)
      ? `cooldown ${respawn >= 60 && respawn % 60 === 0 ? `${respawn / 60} min` : `${respawn} sec`}`
      : "cooldown unknown";
    return `${config.name}: ${capText}, ${distanceText}, ${respawnText}`;
  });
  lines.push("Activation: player inside the zone or within 300 m of its boundary.");
  if (!Array.isArray(zone?.points) || zone.points.length < 3) {
    lines.push("Boundary spline was not present in the map export; marker shows the manager location only.");
  }
  return [zone?.label || "AI Spawn Zone", ...lines].join("\n");
}

const AI_SPAWN_SPECIES = Object.freeze({
  boar: { label: "Boar", icon: "assets/icons/boar.svg" },
  chicken: { label: "Chicken", icon: "assets/icons/chicken.svg" },
  crab: { label: "Crab", icon: "assets/icons/crab.svg" },
  deer: { label: "Deer", icon: "assets/icons/deer.svg" },
  galli: { label: "Gallimimus", icon: "assets/icons/galli.svg" },
  goat: { label: "Goat", icon: "assets/icons/goat.svg" },
  rabbit: { label: "Rabbit", icon: "assets/icons/rabbit.svg" },
  taco: { label: "Psittacosaurus", icon: "assets/icons/mongoose.svg" },
  turtle: { label: "Turtle", icon: "assets/icons/turtle.svg" }
});

function getAISpawnSpeciesKey(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (normalized.includes("chicken")) return "chicken";
  if (normalized.includes("turtle")) return "turtle";
  if (normalized.includes("gallimimus") || normalized.includes("galli")) return "galli";
  if (normalized.includes("taco") || normalized.includes("psittaco")) return "taco";
  return Object.keys(AI_SPAWN_SPECIES).find((key) => normalized.includes(key)) || "";
}

function aggregateAISpawnCaps(configs) {
  const totals = new Map();
  (Array.isArray(configs) ? configs : []).forEach((config) => {
    const key = getAISpawnSpeciesKey(config?.name);
    const species = AI_SPAWN_SPECIES[key];
    const maximum = Number(config?.max);
    if (!species || !Number.isFinite(maximum) || maximum <= 0) return;
    const current = totals.get(key) || { key, ...species, max: 0 };
    current.max += maximum;
    totals.set(key, current);
  });
  return Array.from(totals.values());
}

function getAISpawnZoneSpeciesKeys(zone) {
  return Array.from(new Set(
    (Array.isArray(zone?.configs) ? zone.configs : [])
      .map((config) => getAISpawnSpeciesKey(config?.name))
      .filter(Boolean)
  ));
}

function layoutAISpawnZoneBadges(badges) {
  const badgeWidth = 28;
  const badgeHeight = 18;
  const badgeGap = 2;
  const maxColumns = 4;
  const rowCount = Math.ceil(badges.length / maxColumns);

  badges.forEach((badge, index) => {
    const row = Math.floor(index / maxColumns);
    const column = index % maxColumns;
    const rowStart = row * maxColumns;
    const columnsInRow = Math.min(maxColumns, badges.length - rowStart);
    const rowWidth = columnsInRow * badgeWidth + (columnsInRow - 1) * badgeGap;
    const x = -rowWidth / 2 + column * (badgeWidth + badgeGap);
    const y = -(rowCount * badgeHeight + (rowCount - 1) * badgeGap) / 2
      + row * (badgeHeight + badgeGap);
    badge.setAttribute("transform", `translate(${x} ${y})`);
  });
}

function appendAISpawnZoneCapLabel(labelLayer, zone, mappedPoints = [], zoneId = "") {
  const entries = aggregateAISpawnCaps(zone?.configs);
  if (!entries.length) return;

  let anchor = mappedPoints.length >= 3 ? polygonCentroid(mappedPoints) : null;
  if (!anchor && zone?.location) {
    const x = Number(zone.location.x);
    const y = Number(zone.location.y);
    if (Number.isFinite(x) && Number.isFinite(y)) anchor = gameToMap(y, x);
  }
  if (!anchor) return;

  const badgeWidth = 28;
  const badgeHeight = 18;
  const anchorGroup = svg("g", {
    class: "ai-spawn-zone-cap-anchor",
    transform: `translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)})`,
    "data-ai-zone-id": zoneId
  });
  const label = svg("g", { class: "ai-spawn-zone-cap-label" });
  const badges = [];

  entries.forEach((entry) => {
    const badge = svg("g", {
      class: "ai-spawn-zone-cap-badge",
      "data-species": entry.key,
      "data-cap": entry.max
    });
    badge.append(svg("title", {}, `${entry.label}: maximum ${entry.max}`));
    badge.append(svg("rect", {
      x: 0,
      y: 0,
      width: badgeWidth,
      height: badgeHeight,
      rx: 4,
      ry: 4
    }));
    badge.append(svg("image", {
      href: entry.icon,
      x: 3,
      y: 4,
      width: 10,
      height: 10,
      preserveAspectRatio: "xMidYMid meet"
    }));
    badge.append(svg("text", {
      x: 22.25,
      y: badgeHeight / 2
    }, entry.max));
    label.append(badge);
    badges.push(badge);
  });

  layoutAISpawnZoneBadges(badges);
  anchorGroup.append(label);
  labelLayer.append(anchorGroup);
}

function updateAISpawnZoneSpeciesVisibility() {
  const overlay = $("#group-aiSpawnZones");
  if (!overlay) return;

  const selectedKeys = selectedResourceKeys("animals") || new Set(Object.keys(AI_SPAWN_SPECIES));
  const visibleByZone = new Map();

  overlay.querySelectorAll(".ai-spawn-zone, .ai-spawn-zone-unresolved").forEach((zoneElement) => {
    const zoneKeys = (zoneElement.dataset.speciesKeys || "").split(" ").filter(Boolean);
    const isVisible = zoneKeys.some((key) => selectedKeys.has(key));
    zoneElement.style.display = isVisible ? "" : "none";
    visibleByZone.set(zoneElement.dataset.aiZoneId || "", isVisible);
  });

  overlay.querySelectorAll(".ai-spawn-zone-cap-anchor").forEach((anchor) => {
    const visibleBadges = [];
    anchor.querySelectorAll(".ai-spawn-zone-cap-badge").forEach((badge) => {
      const isVisible = selectedKeys.has(badge.dataset.species || "");
      badge.style.display = isVisible ? "" : "none";
      if (isVisible) visibleBadges.push(badge);
    });
    layoutAISpawnZoneBadges(visibleBadges);
    anchor.style.display = visibleByZone.get(anchor.dataset.aiZoneId || "") && visibleBadges.length
      ? ""
      : "none";
  });
}
function appendAISpawnZoneOverlay() {
  const zones = window.MAP_AI_SPAWN_ZONES;
  if (!Array.isArray(zones) || zones.length === 0 || $("#group-aiSpawnZones")) return;

  const group = svg("g", {
    class: "overlay-ai-spawn-zones",
    id: "group-aiSpawnZones"
  });
  const labelLayer = svg("g", { class: "ai-spawn-zone-cap-labels" });

  zones.forEach((zone, zoneIndex) => {
    const zoneId = String(zoneIndex);
    const speciesKeys = getAISpawnZoneSpeciesKeys(zone);
    const title = svg("title", {}, formatAISpawnZoneDetails(zone));
    const species = (zone.configs || []).map((config) => config.name).filter(Boolean).join(", ");
    if (Array.isArray(zone.points) && zone.points.length >= 3) {
      const mappedPoints = zone.points.map((point) => gameToMap(point.y, point.x));
      const points = mappedPoints
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");
      const polygon = svg("polygon", {
        class: "ai-spawn-zone",
        points,
        "data-name": `${zone.label}: ${species}`,
        "data-species": species,
        "data-species-keys": speciesKeys.join(" "),
        "data-ai-zone-id": zoneId,
        tabindex: "0",
        role: "img",
        "aria-label": formatAISpawnZoneDetails(zone).replaceAll("\n", ". ")
      });
      polygon.append(title);
      group.append(polygon);
      appendAISpawnZoneCapLabel(labelLayer, zone, mappedPoints, zoneId);
      return;
    }

    const location = zone.location;
    if (!location || !Number.isFinite(Number(location.x)) || !Number.isFinite(Number(location.y))) return;
    const mapped = gameToMap(Number(location.y), Number(location.x));
    const marker = svg("g", {
      class: "ai-spawn-zone-unresolved",
      "data-name": `${zone.label}: ${species}`,
      "data-species-keys": speciesKeys.join(" "),
      "data-ai-zone-id": zoneId,
      tabindex: "0",
      role: "img",
      "aria-label": formatAISpawnZoneDetails(zone).replaceAll("\n", ". ")
    });
    marker.append(title);
    marker.append(svg("circle", {
      class: "ai-spawn-zone-approximate",
      cx: mapped.x,
      cy: mapped.y,
      r: 18
    }));
    group.append(marker);
    appendAISpawnZoneCapLabel(labelLayer, zone, [], zoneId);
  });

  group.append(labelLayer);
  els.overlayZones.append(group);
}
function initOverlays() {
  if (_overlaysBuilt) return;
  _overlaysBuilt = true;

  const overlays = window.MAP_OVERLAYS;
  if (!overlays) return;

  // Section
  ["sanctuary", "patrol", "migration", "roads", "aiSpawnZones"].forEach((key) => {
    if (key === "roads" && Array.isArray(window.MAP_ROADS)) {
      const g = svg("g", { class: "overlay-roads", id: "group-roads" });
      window.MAP_ROADS.forEach(road => {
        const points = road.points.map(p => {
          const pt = gameToMap(p.x, p.y);
          return `${pt.x},${pt.y}`;
        }).join(" ");
        const color = road.type === "trail" ? "rgba(235,215,180,0.75)" : "rgba(250,230,200,0.95)";
        const width = road.type === "trail" ? "1" : "2";
        const dash  = road.type === "trail" ? "4 4" : "none";
        g.append(svg("polyline", {
          points, fill: "none", stroke: color,
          "stroke-width": width, "stroke-dasharray": dash,
          "stroke-linejoin": "round", "stroke-linecap": "round",
          "data-name": road.label
        }));
      });
      els.overlayZones.append(g);
      return;
    }

    const data = overlays[key];
    if (!data || !data.zones) return;

    const g = svg("g", { class: `overlay-${key}`, id: `group-${key}` });
    data.zones.forEach((zone, index) => {
      const shapeAttrs = {
        fill: data.color,
        stroke: data.stroke,
        "data-name": zone.label,
        "data-game-name": zone.gameLabel || zone.label
      };
      const isPrimeZone = key === "migration"
        || (key === "patrol" && String(zone.gameLabel || "").startsWith("EPS_Patrol"));
      if (isPrimeZone) {
        shapeAttrs["data-prime-key"] = primeZoneKey(key, zone, index);
        shapeAttrs["data-prime-type"] = key;
      }
      let el = null;
      if (zone.type === "circle") {
        el = svg("circle", {
          ...shapeAttrs,
          cx: zone.cx, cy: zone.cy, r: zone.r,
          "stroke-width": 0.6, opacity: 0.9
        });
      } else if (zone.type === "rect") {
        el = svg("rect", {
          ...shapeAttrs,
          x: zone.x, y: zone.y, width: zone.w, height: zone.h,
          "stroke-width": 0.8, rx: 4
        });
      } else if (zone.type === "polygon") {
        el = svg("polygon", {
          ...shapeAttrs,
          points: zone.points,
          "stroke-width": 0.8
        });
      }
      if (!el) return;
      g.append(el);
      if (key !== "patrol") appendZoneLabel(g, zone, data.stroke);
    });
    els.overlayZones.append(g);
  });

  appendAISpawnZoneOverlay();

  // Section
  if ($("#toggleWater")?.checked && Array.isArray(window.MAP_WATER_LABELS)) {
    const g = svg("g", { class: "overlay-water-labels", id: "group-water" });
    window.MAP_WATER_LABELS.forEach(item => {
      const point = gameToMap(item.x, item.y);
      const lines = item.label.split(/<br\s*\/?>/i);
      lines.forEach((line, index) => {
        g.append(svg("text", {
          x: point.x, y: point.y + (index * 12),
          "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#a8e6cf",
          "font-size": "calc(var(--pin-font-size) * 0.9)",
          "paint-order": "stroke", stroke: "rgba(0,0,0,0.6)",
          "stroke-width": "0.6", "font-weight": "600"
        }, line.replace(/<[^>]*>?/gm, '')));
      });
    });
    els.overlayZones.append(g);
  }

  if (useMobileResourceLod()) return;

  // Section
  RESOURCE_OVERLAY_KEYS.forEach((key) => {
    const cb = $(`[data-overlay="${key}"]`);
    if (!cb || !cb.checked) return;

    const items = overlays[key];
    if (!items) return;

    const g = svg("g", { class: `overlay-${key}`, id: `group-${key}` });
    items.forEach((item) => {
      let el;
      if (item.emoji && item.emoji.endsWith(".svg")) {
        // Section
        el = svg("image", {
          href: item.emoji,
          x: item.x, y: item.y,
          class: "resource-icon resource-icon-svg",
          "data-resource-key": item.key,
          "data-name": item.name,
          "data-updated": item.updated || "",
          "data-coord": item.coord || "",
          "data-x": item.x,
          "data-y": item.y
        });
      } else {
        el = resourceFallbackElement(item);
      }
      g.append(el);
    });
    els.overlayResources.append(g);
  });
}

function appendZoneLabel(group, zone, color) {
  const anchor = zoneLabelAnchor(zone);
  if (!anchor || !zone.label) return;

  const text = svg("text", {
    class: "zone-label",
    x: anchor.x,
    y: anchor.y,
    fill: color,
    "text-anchor": "middle",
    "dominant-baseline": "central"
  });
  text.append(svg("tspan", {
    class: "zone-label-main",
    x: anchor.x,
    dy: zone.gameLabel ? "-0.15em" : "0"
  }, zone.label));
  if (zone.gameLabel) {
    text.append(svg("tspan", {
      class: "zone-label-game",
      x: anchor.x,
      dy: "1.15em"
    }, `(${zone.gameLabel})`));
  }
  group.append(text);
}

function zoneDisplayName(zone) {
  if (!zone) return "";
  return zone.gameLabel ? `${zone.label} (${zone.gameLabel})` : zone.label;
}

function zoneSearchText(zone) {
  return [zone?.label, zone?.gameLabel].filter(Boolean).join(" ").toLowerCase();
}

function zoneLabelAnchor(zone) {
  if (!zone) return null;
  if (zone.type === "circle") return { x: Number(zone.cx), y: Number(zone.cy) };
  if (zone.type === "rect") return { x: Number(zone.x) + Number(zone.w) / 2, y: Number(zone.y) + Number(zone.h) / 2 };
  if (zone.type === "polygon") return polygonCentroid(parseZonePoints(zone.points));
  return null;
}

function parseZonePoints(points) {
  return String(points || "").trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function polygonCentroid(points) {
  if (!points.length) return null;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 0.0001) {
    return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

function trackedPointTimestamp(point) {
  const explicit = Number(point?.at);
  if (Number.isFinite(explicit)) return explicit;
  const match = String(point?.id || "").match(/^history-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function pointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx ** 2 + dy ** 2;
  if (lengthSquared < 0.0001) return Math.hypot(point.x - start.x, point.y - start.y) < 0.0001;
  const cross = (point.y - start.y) * dx - (point.x - start.x) * dy;
  if (Math.abs(cross) > 0.0001) return false;
  const dot = (point.x - start.x) * dx + (point.y - start.y) * dy;
  return dot >= 0 && dot <= lengthSquared;
}

function pointInPolygon(point, points) {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[j];
    const b = points[i];
    if (pointOnSegment(point, a, b)) return true;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInZone(point, zone) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !zone) return false;
  if (zone.type === "circle") {
    return Math.hypot(x - Number(zone.cx), y - Number(zone.cy)) <= Number(zone.r);
  }
  if (zone.type === "rect") {
    return x >= Number(zone.x)
      && x <= Number(zone.x) + Number(zone.w)
      && y >= Number(zone.y)
      && y <= Number(zone.y) + Number(zone.h);
  }
  if (zone.type === "polygon") {
    return pointInPolygon({ x, y }, parseZonePoints(zone.points));
  }
  return false;
}

function primeZoneKey(type, zone, index) {
  return `${type}:${zone.gameLabel || zone.label || index}`;
}

function primeZoneCenter(zone) {
  if (zone.type === "circle") return { x: Number(zone.cx), y: Number(zone.cy) };
  if (zone.type === "rect") {
    return {
      x: Number(zone.x) + Number(zone.w) / 2,
      y: Number(zone.y) + Number(zone.h) / 2
    };
  }
  const points = parseZonePoints(zone.points);
  if (!points.length) return { x: 0, y: 0 };
  return points.reduce((center, point) => ({
    x: center.x + point.x / points.length,
    y: center.y + point.y / points.length
  }), { x: 0, y: 0 });
}

function primeZoneCatalog() {
  const overlays = window.MAP_OVERLAYS;
  if (!overlays) return [];
  const zones = [];
  ["patrol", "migration"].forEach((type) => {
    (overlays[type]?.zones || []).forEach((zone, index) => {
      if (type === "patrol" && !String(zone.gameLabel || "").startsWith("EPS_Patrol")) return;
      zones.push({
        type,
        key: primeZoneKey(type, zone, index),
        name: zoneDisplayName(zone),
        center: primeZoneCenter(zone),
        zone
      });
    });
  });
  return zones;
}

function primeZonesAtPoint(point) {
  return primeZoneCatalog().filter((item) => pointInZone(point, item.zone));
}

function primeZoneByKey(key) {
  return primeZoneCatalog().find((zone) => zone.key === key) || null;
}

function createPrimeRunId() {
  const suffix = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `prime-${Date.now()}-${suffix}`;
}

function normalizedPrimePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizePrimeEntry(entry, index = 0) {
  const zone = primeZoneByKey(String(entry?.key || ""));
  if (!zone) return null;
  const at = Number(entry?.at);
  return {
    id: String(entry?.id || `prime-entry-${Date.now()}-${index}`),
    key: zone.key,
    type: zone.type,
    name: zone.name,
    at: Number.isFinite(at) ? at : Date.now(),
    point: normalizedPrimePoint(entry?.point)
  };
}

function normalizeSavedPrimeRun(run, index = 0) {
  const completedAt = Number(run?.completedAt);
  const startedAt = Number(run?.startedAt);
  const durationMs = Number(run?.durationMs);
  if (!Number.isFinite(completedAt)) return null;
  return {
    id: String(run?.id || `saved-prime-${completedAt}-${index}`),
    runId: String(run?.runId || ""),
    startedAt: Number.isFinite(startedAt) ? startedAt : completedAt,
    completedAt,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
    patrolNames: Array.isArray(run?.patrolNames) ? run.patrolNames.map(String) : [],
    migrationNames: Array.isArray(run?.migrationNames) ? run.migrationNames.map(String) : []
  };
}

function loadPrimeTracker() {
  const saved = readJson(PRIME_TRACKER_STORAGE_KEY, {});
  const patrolKeys = Array.isArray(saved.patrol) ? saved.patrol.map(String) : [];
  const migrationKeys = Array.isArray(saved.migration) ? saved.migration.map(String) : [];
  const entries = Array.isArray(saved.entries)
    ? saved.entries.map(normalizePrimeEntry).filter(Boolean)
    : [];
  if (!entries.length) {
    [...patrolKeys, ...migrationKeys].forEach((key, index) => {
      const zone = primeZoneByKey(key);
      if (!zone) return;
      entries.push({
        id: `prime-imported-${index}-${Date.now()}`,
        key: zone.key,
        type: zone.type,
        name: zone.name,
        at: Number(saved.startedAt) || Date.now(),
        point: null
      });
    });
  }
  primeTracker.entries = entries;
  primeTracker.patrol = new Set(patrolKeys);
  primeTracker.migration = new Set(migrationKeys);
  entries.forEach((entry) => primeTracker[entry.type].add(entry.key));
  primeTracker.currentlyInside = new Set(Array.isArray(saved.currentlyInside) ? saved.currentlyInside : []);
  primeTracker.savedRuns = Array.isArray(saved.savedRuns)
    ? saved.savedRuns.map(normalizeSavedPrimeRun).filter(Boolean).slice(0, PRIME_MAX_SAVED_RUNS)
    : [];
  primeTracker.pendingOverlap = [];
  primeTracker.latestPoint = normalizedPrimePoint(saved.latestPoint);
  primeTracker.routeMode = saved.routeMode === true;
  primeTracker.routeTargets = [];
  primeTracker.runId = String(saved.runId || createPrimeRunId());
  primeTracker.startedAt = Number(saved.startedAt) || Date.now();
  primeTracker.completedAt = Number(saved.completedAt) || null;
  if (primeTracker.completedAt && !primeRunComplete()) primeTracker.completedAt = null;
  primeTracker.latestMessage = String(saved.latestMessage || (entries.length ? "Previous run restored." : ""));
  primeTracker.collapsed = saved.collapsed === true;
}

function persistPrimeTracker() {
  writeJson(PRIME_TRACKER_STORAGE_KEY, {
    version: 2,
    patrol: Array.from(primeTracker.patrol),
    migration: Array.from(primeTracker.migration),
    currentlyInside: Array.from(primeTracker.currentlyInside),
    entries: primeTracker.entries,
    savedRuns: primeTracker.savedRuns,
    pendingOverlap: primeTracker.pendingOverlap.map((zone) => zone.key),
    latestPoint: primeTracker.latestPoint,
    routeMode: primeTracker.routeMode,
    runId: primeTracker.runId,
    startedAt: primeTracker.startedAt,
    completedAt: primeTracker.completedAt,
    latestMessage: primeTracker.latestMessage,
    collapsed: primeTracker.collapsed
  });
}

function setPrimeTrackerCollapsed(collapsed, shouldPersist = true) {
  primeTracker.collapsed = Boolean(collapsed);
  const tracker = $("#primeTracker");
  const toggle = $("#primeTrackerToggle");
  if (tracker) tracker.classList.toggle("is-collapsed", primeTracker.collapsed);
  if (toggle) {
    const action = primeTracker.collapsed ? "Expand" : "Collapse";
    toggle.setAttribute("aria-expanded", String(!primeTracker.collapsed));
    toggle.setAttribute("aria-label", `${action} Prime Tracker`);
    toggle.title = `${action} Prime Tracker`;
  }
  if (shouldPersist) persistPrimeTracker();
}

function primeRunComplete() {
  return primeTracker.patrol.size >= PRIME_PATROL_TARGET
    && primeTracker.migration.size >= PRIME_MIGRATION_TARGET;
}

function primeElapsedMs() {
  return Math.max(0, (primeTracker.completedAt || Date.now()) - primeTracker.startedAt);
}

function formatPrimeDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderPrimeTimer() {
  const elapsed = primeElapsedMs();
  const timer = $("#primeTrackerTimer");
  if (timer) {
    timer.textContent = formatPrimeDuration(elapsed);
    timer.dateTime = `PT${Math.floor(elapsed / 1000)}S`;
  }
  if ($("#primeTrackerRunState")) {
    $("#primeTrackerRunState").textContent = primeTracker.completedAt ? "Run complete" : "Active run";
  }
}

function startPrimeTrackerTimer() {
  if (_primeTimerInterval) clearInterval(_primeTimerInterval);
  renderPrimeTimer();
  _primeTimerInterval = window.setInterval(renderPrimeTimer, 1000);
}

function saveCompletedPrimeRun() {
  if (!primeRunComplete() || primeTracker.completedAt) return false;
  primeTracker.completedAt = Date.now();
  const patrolNames = primeTracker.entries
    .filter((entry) => entry.type === "patrol")
    .map((entry) => entry.name);
  const migrationNames = primeTracker.entries
    .filter((entry) => entry.type === "migration")
    .map((entry) => entry.name);
  primeTracker.savedRuns.unshift({
    id: `saved-${primeTracker.runId}`,
    runId: primeTracker.runId,
    startedAt: primeTracker.startedAt,
    completedAt: primeTracker.completedAt,
    durationMs: primeElapsedMs(),
    patrolNames,
    migrationNames
  });
  primeTracker.savedRuns = primeTracker.savedRuns.slice(0, PRIME_MAX_SAVED_RUNS);
  primeTracker.latestMessage = `Prime targets reached in ${formatPrimeDuration(primeElapsedMs())}.`;
  return true;
}

function renderPrimeEntryHistory() {
  const list = $("#primeEntryHistory");
  if (!list) return;
  list.replaceChildren();
  if (!primeTracker.entries.length) {
    const empty = document.createElement("li");
    empty.className = "prime-list-empty";
    empty.textContent = "No zones entered this run.";
    list.append(empty);
  } else {
    primeTracker.entries.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      item.className = `prime-entry prime-entry-${entry.type}`;
      const label = document.createElement("span");
      label.textContent = `${entry.type === "patrol" ? "P" : "M"} \u00b7 ${entry.name}`;
      const time = document.createElement("time");
      time.dateTime = new Date(entry.at).toISOString();
      time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      item.append(label, time);
      list.append(item);
    });
  }
  if ($("#primeEntryCount")) $("#primeEntryCount").textContent = String(primeTracker.entries.length);
}

function renderSavedPrimeRuns() {
  const list = $("#primeSavedRuns");
  if (!list) return;
  list.replaceChildren();
  if (!primeTracker.savedRuns.length) {
    const empty = document.createElement("li");
    empty.className = "prime-list-empty";
    empty.textContent = "Completed runs will be saved here.";
    list.append(empty);
  } else {
    primeTracker.savedRuns.forEach((run) => {
      const item = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const completed = new Date(run.completedAt);
      summary.textContent = `${completed.toLocaleDateString([], { month: "short", day: "numeric" })} \u00b7 ${formatPrimeDuration(run.durationMs)}`;
      const patrol = document.createElement("p");
      patrol.textContent = `Patrol: ${run.patrolNames.join(", ") || "None"}`;
      const migration = document.createElement("p");
      migration.textContent = `Migration: ${run.migrationNames.join(", ") || "None"}`;
      details.append(summary, patrol, migration);
      item.append(details);
      list.append(item);
    });
  }
  if ($("#primeSavedRunCount")) $("#primeSavedRunCount").textContent = String(primeTracker.savedRuns.length);
}

function primeDistanceMeters(start, end) {
  return Math.hypot((Number(end.x) - Number(start.x)) * 11.12, (Number(end.y) - Number(start.y)) * 11.13);
}

function formatPrimeDistance(meters) {
  if (meters < 1000) return `~${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `~${(meters / 1000).toFixed(1)} km`;
}

function updatePrimeRouteTargets() {
  primeTracker.routeTargets = [];
  if (!primeTracker.routeMode || !primeTracker.latestPoint) return;
  ["patrol", "migration"].forEach((type) => {
    const target = type === "patrol" ? PRIME_PATROL_TARGET : PRIME_MIGRATION_TARGET;
    if (primeTracker[type].size >= target) return;
    const nearest = primeZoneCatalog()
      .filter((zone) => zone.type === type && !primeTracker[type].has(zone.key))
      .map((zone) => ({ ...zone, distance: primeDistanceMeters(primeTracker.latestPoint, zone.center) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest) primeTracker.routeTargets.push(nearest);
  });
}

function renderPrimeRouteSummary() {
  const summary = $("#primeRouteSummary");
  if (!summary) return;
  summary.replaceChildren();
  summary.classList.toggle("is-hidden", !primeTracker.routeMode);
  if (!primeTracker.routeMode) return;
  const heading = document.createElement("strong");
  heading.textContent = "Nearest unvisited";
  summary.append(heading);
  if (!primeTracker.latestPoint) {
    const waiting = document.createElement("span");
    waiting.textContent = "Waiting for a location ping.";
    summary.append(waiting);
    return;
  }
  if (!primeTracker.routeTargets.length) {
    const complete = document.createElement("span");
    complete.textContent = "All required zone types are complete.";
    summary.append(complete);
    return;
  }
  primeTracker.routeTargets.forEach((target) => {
    const row = document.createElement("span");
    row.className = `prime-route-item prime-route-${target.type}`;
    row.textContent = `${target.type === "patrol" ? "P" : "M"} \u00b7 ${target.name} \u00b7 ${formatPrimeDistance(target.distance)}`;
    summary.append(row);
  });
}

function syncPrimeZoneVisuals() {
  updatePrimeRouteTargets();
  const routeKeys = new Set(primeTracker.routeTargets.map((zone) => zone.key));
  $$('[data-prime-key]').forEach((element) => {
    const key = element.dataset.primeKey;
    const type = element.dataset.primeType;
    const visited = Boolean(primeTracker[type]?.has(key));
    element.classList.toggle("is-prime-visited", visited);
    element.classList.toggle("is-prime-route-target", routeKeys.has(key));
  });
}

function renderPrimeOverlapPrompt() {
  const prompt = $("#primeOverlapPrompt");
  const choices = $("#primeOverlapChoices");
  if (!prompt || !choices) return;
  choices.replaceChildren();
  prompt.classList.toggle("is-hidden", !primeTracker.pendingOverlap.length);
  primeTracker.pendingOverlap.forEach((zone) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `prime-overlap-choice prime-overlap-choice-${zone.type}`;
    button.textContent = `${zone.type === "patrol" ? "Patrol" : "Migration"} \u00b7 ${zone.name}`;
    button.addEventListener("click", () => choosePrimeOverlapZone(zone.key));
    choices.append(button);
  });
}

function renderPrimeTracker() {
  const patrolCount = primeTracker.patrol.size;
  const migrationCount = primeTracker.migration.size;
  const patrolProgress = Math.min(patrolCount, PRIME_PATROL_TARGET);
  const migrationProgress = Math.min(migrationCount, PRIME_MIGRATION_TARGET);
  if ($("#primePatrolCount")) $("#primePatrolCount").textContent = String(patrolProgress);
  if ($("#primeMigrationCount")) $("#primeMigrationCount").textContent = String(migrationProgress);
  if ($("#primePatrolMobileCount")) $("#primePatrolMobileCount").textContent = String(patrolProgress);
  if ($("#primeMigrationMobileCount")) $("#primeMigrationMobileCount").textContent = String(migrationProgress);
  if ($("#primePatrolProgressFill")) {
    $("#primePatrolProgressFill").style.width = `${(patrolProgress / PRIME_PATROL_TARGET) * 100}%`;
  }
  if ($("#primeMigrationProgressFill")) {
    $("#primeMigrationProgressFill").style.width = `${(migrationProgress / PRIME_MIGRATION_TARGET) * 100}%`;
  }
  if ($("#primePatrolProgress")) {
    $("#primePatrolProgress").setAttribute("aria-valuenow", String(patrolProgress));
    $("#primePatrolProgress").classList.toggle("is-complete", patrolProgress >= PRIME_PATROL_TARGET);
  }
  if ($("#primePatrolCheck")) {
    $("#primePatrolCheck").classList.toggle("is-visible", patrolProgress >= PRIME_PATROL_TARGET);
  }
  if ($("#primeMigrationProgress")) {
    $("#primeMigrationProgress").setAttribute("aria-valuenow", String(migrationProgress));
    $("#primeMigrationProgress").classList.toggle("is-complete", migrationProgress >= PRIME_MIGRATION_TARGET);
  }
  if ($("#primeMigrationCheck")) {
    $("#primeMigrationCheck").classList.toggle("is-visible", migrationProgress >= PRIME_MIGRATION_TARGET);
  }
  if ($("#primeTrackerUndo")) $("#primeTrackerUndo").disabled = primeTracker.entries.length === 0;
  if ($("#primeTrackerRoute")) {
    $("#primeTrackerRoute").textContent = primeTracker.routeMode ? "Route on" : "Route off";
    $("#primeTrackerRoute").setAttribute("aria-pressed", String(primeTracker.routeMode));
    $("#primeTrackerRoute").classList.toggle("is-active", primeTracker.routeMode);
  }
  if ($("#primeTrackerStatus")) {
    $("#primeTrackerStatus").textContent = primeTracker.latestMessage || "Waiting for a tracked location.";
  }
  renderPrimeTimer();
  renderPrimeEntryHistory();
  renderSavedPrimeRuns();
  updatePrimeRouteTargets();
  renderPrimeRouteSummary();
  renderPrimeOverlapPrompt();
  setPrimeTrackerCollapsed(primeTracker.collapsed, false);
  syncPrimeZoneVisuals();
}

function recordPrimeZoneEntries(zones, point = primeTracker.latestPoint) {
  if (primeTracker.completedAt) return false;
  const entered = [];
  const at = Date.now();
  zones.forEach((zone) => {
    const visited = primeTracker[zone.type];
    if (!visited || visited.has(zone.key)) return;
    visited.add(zone.key);
    primeTracker.entries.push({
      id: `prime-entry-${at}-${primeTracker.entries.length}`,
      key: zone.key,
      type: zone.type,
      name: zone.name,
      at,
      point: normalizedPrimePoint(point)
    });
    entered.push(zone);
  });
  if (!entered.length) return false;
  primeTracker.pendingOverlap = [];
  if (!saveCompletedPrimeRun()) {
    const names = entered
      .map((zone) => `${zone.type === "patrol" ? "Patrol" : "Migration"}: ${zone.name}`)
      .join(", ");
    primeTracker.latestMessage = entered.length === 1
      ? `Entered ${names}.`
      : `Entered ${entered.length} overlapping zones: ${names}.`;
  }
  persistPrimeTracker();
  renderPrimeTracker();
  return true;
}

function recordPrimeZoneEntry(zone, point = primeTracker.latestPoint) {
  return recordPrimeZoneEntries([zone], point);
}

function updatePrimeTrackerForPoint(point) {
  primeTracker.latestPoint = normalizedPrimePoint(point);
  const matches = primeZonesAtPoint(point);
  const currentKeys = new Set(matches.map((zone) => zone.key));
  if (primeTracker.pendingOverlap.length
    && !primeTracker.pendingOverlap.some((zone) => currentKeys.has(zone.key))) {
    primeTracker.pendingOverlap = [];
  }
  if (primeTracker.completedAt) {
    primeTracker.currentlyInside = currentKeys;
    primeTracker.latestMessage = `Run complete in ${formatPrimeDuration(primeElapsedMs())}. Start a new run when ready.`;
    persistPrimeTracker();
    renderPrimeTracker();
    return;
  }
  const entered = matches.filter((zone) => !primeTracker.currentlyInside.has(zone.key));
  const candidates = entered.filter((zone) => !primeTracker[zone.type].has(zone.key));
  primeTracker.currentlyInside = currentKeys;
  if (candidates.length) {
    recordPrimeZoneEntries(candidates, point);
    return;
  } else if (matches.length === 1) {
    primeTracker.latestMessage = `Inside ${matches[0].name}.`;
  } else if (matches.length > 1) {
    primeTracker.latestMessage = `Inside ${matches.length} overlapping mapped zones; no new zone counted.`;
  } else {
    primeTracker.latestMessage = "Outside mapped patrol and migration zones.";
  }
  persistPrimeTracker();
  renderPrimeTracker();
}

function choosePrimeOverlapZone(key) {
  const zone = primeTracker.pendingOverlap.find((candidate) => candidate.key === key);
  if (!zone) return;
  recordPrimeZoneEntry(zone, primeTracker.latestPoint);
}

function dismissPrimeOverlap() {
  if (!primeTracker.pendingOverlap.length) return;
  primeTracker.pendingOverlap = [];
  primeTracker.latestMessage = "Overlapping entry dismissed; no zone was counted.";
  persistPrimeTracker();
  renderPrimeTracker();
}

function undoLastPrimeEntry() {
  const entry = primeTracker.entries.pop();
  if (!entry) return;
  primeTracker[entry.type].delete(entry.key);
  primeTracker.currentlyInside.delete(entry.key);
  primeTracker.pendingOverlap = [];
  if (primeTracker.completedAt && !primeRunComplete()) {
    primeTracker.savedRuns = primeTracker.savedRuns.filter((run) => run.runId !== primeTracker.runId);
    primeTracker.completedAt = null;
  }
  primeTracker.latestMessage = `Removed ${entry.type === "patrol" ? "Patrol" : "Migration"}: ${entry.name}.`;
  persistPrimeTracker();
  renderPrimeTracker();
}

function clearCurrentPrimeRun(message) {
  primeTracker.patrol.clear();
  primeTracker.migration.clear();
  primeTracker.currentlyInside.clear();
  primeTracker.entries = [];
  primeTracker.pendingOverlap = [];
  primeTracker.routeTargets = [];
  primeTracker.runId = createPrimeRunId();
  primeTracker.startedAt = Date.now();
  primeTracker.completedAt = null;
  primeTracker.latestMessage = message;
}

function startNewPrimeRun() {
  clearCurrentPrimeRun("New run started. Waiting for a tracked location.");
  persistPrimeTracker();
  renderPrimeTracker();
}

function resetPrimeTracker(clearSavedRuns = false) {
  clearCurrentPrimeRun("Tracker cleared. Waiting for a tracked location.");
  if (clearSavedRuns) primeTracker.savedRuns = [];
  persistPrimeTracker();
  renderPrimeTracker();
}

// Section
function useMobileResourceLod() {
  return isMobileViewport();
}


function resourceFallbackElement(item) {
  return svg("circle", {
    cx: item.x,
    cy: item.y,
    r: 3.2,
    class: "resource-icon resource-icon-dot",
    "data-resource-key": item.key,
    "data-name": item.name,
    "data-updated": item.updated || "",
    "data-coord": item.coord || "",
    "data-x": item.x,
    "data-y": item.y
  });
}

function resourceIconElement(item) {
  if (item.emoji && item.emoji.endsWith(".svg")) {
    return svg("image", {
      href: item.emoji,
      x: item.x, y: item.y,
      class: "resource-icon resource-icon-svg",
      "data-resource-key": item.key,
      "data-name": item.name,
      "data-updated": item.updated || "",
      "data-coord": item.coord || "",
      "data-x": item.x,
      "data-y": item.y
    });
  }

  return resourceFallbackElement(item);
}

function selectedResourceKeys(overlayKey) {
  const controls = $$(`[data-sub-overlay="${overlayKey}"]`);
  if (!controls.length) return null;
  return new Set(
    controls
      .filter((control) => control.checked)
      .map((control) => control.dataset.resourceKey)
      .filter(Boolean)
  );
}

function aiSpawnZonesEnabled() {
  return Boolean($("#toggleAISpawnZones")?.checked);
}

function activeResourceOverlayKeys() {
  return RESOURCE_OVERLAY_KEYS.filter((key) => {
    if (key === "animals" && aiSpawnZonesEnabled()) return false;
    const control = $(`[data-overlay="${key}"]`);
    return control && control.checked;
  });
}

function visibleMapBounds(paddingPx = 0) {
  const rect = els.viewport.getBoundingClientRect();
  const zoom = Math.max(0.01, state.view.zoom);
  const width = Math.max(1, baseStageWidth());
  const height = Math.max(1, baseStageHeight());

  const left = -rect.width / 2 - paddingPx;
  const right = rect.width / 2 + paddingPx;
  const top = -rect.height / 2 - paddingPx;
  const bottom = rect.height / 2 + paddingPx;

  return {
    xMin: clamp(((left - state.view.x) / (width * zoom) + 0.5) * 1000, 0, 1000),
    xMax: clamp(((right - state.view.x) / (width * zoom) + 0.5) * 1000, 0, 1000),
    yMin: clamp(((top - state.view.y) / (height * zoom) + 0.5) * 1003, 0, 1003),
    yMax: clamp(((bottom - state.view.y) / (height * zoom) + 0.5) * 1003, 0, 1003)
  };
}

function removeMobileResourceLayer() {
  const layer = document.getElementById("mobile-resource-icons");
  if (layer) layer.remove();
  _mobileResourceRenderKey = "";
}

function mobileResourceRenderSignature(activeKeys, bounds) {
  const subKeys = activeKeys.map((key) => {
    const selected = selectedResourceKeys(key);
    return `${key}:${selected ? [...selected].sort().join(",") : "*"}`;
  }).join("|");

  return [
    Math.round(state.view.zoom * 4),
    Math.round(bounds.xMin / 18),
    Math.round(bounds.xMax / 18),
    Math.round(bounds.yMin / 18),
    Math.round(bounds.yMax / 18),
    subKeys
  ].join(":");
}

function renderMobileResourceLayer() {
  _mobileResourceRenderTimer = null;
  if (!useMobileResourceLod()) {
    removeMobileResourceLayer();
    return;
  }

  RESOURCE_OVERLAY_KEYS.forEach((key) => {
    const group = document.getElementById(`group-${key}`);
    if (group) group.style.display = "none";
  });

  const activeKeys = activeResourceOverlayKeys();
  if (!activeKeys.length || state.view.zoom < MOBILE_RESOURCE_ICON_MIN_ZOOM) {
    removeMobileResourceLayer();
    return;
  }

  const bounds = visibleMapBounds(MOBILE_RESOURCE_RENDER_PADDING_PX);
  const signature = mobileResourceRenderSignature(activeKeys, bounds);
  if (signature === _mobileResourceRenderKey) return;
  _mobileResourceRenderKey = signature;

  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerY = (bounds.yMin + bounds.yMax) / 2;
  const perOverlayLimit = Math.max(80, Math.ceil(MOBILE_RESOURCE_ICON_LIMIT / activeKeys.length));
  const candidates = [];

  activeKeys.forEach((key) => {
    const items = window.MAP_OVERLAYS?.[key];
    if (!Array.isArray(items)) return;

    const selected = selectedResourceKeys(key);
    if (selected && selected.size === 0) return;

    const scoped = items
      .filter((item) => (
        item.x >= bounds.xMin &&
        item.x <= bounds.xMax &&
        item.y >= bounds.yMin &&
        item.y <= bounds.yMax &&
        (!selected || selected.has(item.key))
      ))
      .map((item) => ({
        item,
        distance: Math.hypot(item.x - centerX, item.y - centerY)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, perOverlayLimit);

    candidates.push(...scoped);
  });

  candidates.sort((a, b) => a.distance - b.distance);
  const visible = candidates.slice(0, MOBILE_RESOURCE_ICON_LIMIT);
  const layer = svg("g", { class: "mobile-resource-icons", id: "mobile-resource-icons" });
  const fragment = document.createDocumentFragment();
  visible.forEach(({ item }) => fragment.append(resourceIconElement(item)));
  layer.append(fragment);

  removeMobileResourceLayer();
  _mobileResourceRenderKey = signature;
  els.overlayResources.append(layer);
}

function scheduleMobileResourceRender(delay = 120) {
  if (!useMobileResourceLod()) return;
  if (_mobileResourceRenderTimer) clearTimeout(_mobileResourceRenderTimer);
  _mobileResourceRenderTimer = setTimeout(renderMobileResourceLayer, delay);
}

function ensureOverlayGroup(key) {
  const groupId = key === "water" ? "group-water" : `group-${key}`;
  if (document.getElementById(groupId)) return;

  if (key === "water") {
    if (!Array.isArray(window.MAP_WATER_LABELS)) return;
    const g = svg("g", { class: "overlay-water-labels", id: "group-water" });
    window.MAP_WATER_LABELS.forEach(item => {
      const point = gameToMap(item.x, item.y);
      const lines = item.label.split(/<br\s*\/?>/i);
      lines.forEach((line, index) => {
        g.append(svg("text", {
          x: point.x, y: point.y + (index * 12),
          "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#a8e6cf",
          "font-size": "calc(var(--pin-font-size) * 0.9)",
          "paint-order": "stroke", stroke: "rgba(0,0,0,0.6)",
          "stroke-width": "0.6", "font-weight": "600"
        }, line.replace(/<[^>]*>?/gm, '')));
      });
    });
    els.overlayZones.append(g);
    return;
  }

  if (!RESOURCE_OVERLAY_KEYS.includes(key) || useMobileResourceLod()) return;
  const items = window.MAP_OVERLAYS?.[key];
  if (!items) return;

  const g = svg("g", { class: `overlay-${key}`, id: `group-${key}` });
  items.forEach((item) => {
    g.append(resourceIconElement(item));
  });
  els.overlayResources.append(g);
}

function updateOverlayVisibility(changedControl = null) {
  initOverlays(); // Section

  const changedId = changedControl?.id || "";
  const shouldRefreshHeatmap =
    !changedControl ||
    changedId === "toggleHeatmap" ||
    (Date.now() - _heatmapDrawnAt > HEATMAP_TTL);

  // Section
  const waterImg = $("#waterMapImage");
  const waterCb = $("#toggleWater");
  const isWaterChecked = waterCb && waterCb.checked;
  if (isWaterChecked) ensureOverlayGroup("water");
  if (waterImg) {
    if (isWaterChecked) {
      if (waterImg.dataset.src && waterImg.getAttribute("src") !== waterImg.dataset.src) {
        waterImg.src = waterImg.dataset.src;
      }
      waterImg.classList.remove("is-hidden");
    } else {
      waterImg.classList.add("is-hidden");
    }
  }
  // Section
  const waterGroup = $("#group-water");
  if (waterGroup) waterGroup.style.display = isWaterChecked ? "" : "none";

  // Section
  const heatmapCb = $("#toggleHeatmap");
  const heatmapCanvas = $("#heatmapCanvas");
  if (heatmapCanvas) {
    if (heatmapCb && heatmapCb.checked) {
      heatmapCanvas.classList.remove("is-hidden");
      if (shouldRefreshHeatmap && !_heatmapRenderPromise) {
        _heatmapRenderPromise = renderHeatmap()
          .catch(() => {})
          .finally(() => {
            _heatmapRenderPromise = null;
          });
      }
    } else {
      heatmapCanvas.classList.add("is-hidden");
    }
  }

  // Section
  ["sanctuary", "patrol", "migration", "roads", "aiSpawnZones"].forEach((key) => {
    const g = $(`#group-${key}`);
    if (!g) return;
    const cb = $(`[data-overlay="${key}"]`);
    g.style.display = (cb && cb.checked) ? "" : "none";
  });
  updateAISpawnZoneSpeciesVisibility();
  syncPrimeZoneVisuals();

  // Section
  if (useMobileResourceLod()) {
    RESOURCE_OVERLAY_KEYS.forEach((key) => {
      const g = $(`#group-${key}`);
      if (g) g.style.display = "none";
    });
    scheduleMobileResourceRender(0);
  } else {
    removeMobileResourceLayer();
    RESOURCE_OVERLAY_KEYS.forEach((key) => {
      const cb = $(`[data-overlay="${key}"]`);
      const shouldShow = Boolean(cb?.checked) && !(key === "animals" && aiSpawnZonesEnabled());
      if (shouldShow) ensureOverlayGroup(key);
      const g = $(`#group-${key}`);
      if (!g) return;
      g.style.display = shouldShow ? "" : "none";
    });
  }

  // Section
  if (!changedControl || changedControl.matches?.("[data-sub-overlay]")) {
    let styleEl = document.getElementById("dynamic-overlay-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-overlay-styles";
      document.head.append(styleEl);
    }

    const uncheckedKeys = [];
    $$("[data-sub-overlay]").forEach(el => {
      if (el.checked || !el.dataset.resourceKey) return;
      uncheckedKeys.push(el.dataset.resourceKey);
    });

    styleEl.textContent = uncheckedKeys.length > 0
      ? uncheckedKeys.map(k => `#overlayResources [data-resource-key="${k}"] { display: none !important; }`).join("\n")
      : "";
  }

  if (!changedControl) applyView(false);
}

// Section
function renderOverlays(changedControl = null) {
  updateOverlayVisibility(changedControl);
}

// Section
function _renderOverlays_DEAD() {
  const overlays = window.MAP_OVERLAYS;
  if (!overlays) return;

  // Section
  ["sanctuary", "patrol", "migration", "roads", "aiSpawnZones"].forEach((key) => {
    const cb = $(`[data-overlay="${key}"]`);
    if (!cb || !cb.checked) return;

    if (key === "roads" && Array.isArray(window.MAP_ROADS)) {
      const g = svg("g", { class: "overlay-roads" });
      window.MAP_ROADS.forEach(road => {
        const points = road.points.map(p => {
          const point = gameToMap(p.x, p.y);
          return `${point.x},${point.y}`;
        }).join(" ");

        let color = road.type === "trail" ? "rgba(235, 215, 180, 0.75)" : "rgba(250, 230, 200, 0.95)";
        let width = road.type === "trail" ? "1" : "2";
        let dash = road.type === "trail" ? "4 4" : "none";

        g.append(svg("polyline", {
          points,
          fill: "none",
          stroke: color,
          "stroke-width": width,
          "stroke-dasharray": dash,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          "data-name": road.label
        }));
      });
      els.overlayZones.append(g);
      return;
    }

    const data = overlays[key];
    if (!data || !data.zones) return;

    const g = svg("g", { class: `overlay-${key}` });
    data.zones.forEach((zone) => {
      if (zone.type === "circle") {
        g.append(svg("circle", {
          cx: zone.cx, cy: zone.cy, r: zone.r,
          fill: data.color, stroke: data.stroke,
          "stroke-width": 0.6,
          opacity: 0.9
        }));
        if (key !== "patrol") {
          g.append(svg("text", {
            x: zone.cx, y: zone.cy + 4,
            "text-anchor": "middle",
            fill: data.stroke,
            "font-size": "var(--pin-font-size)",
            "paint-order": "stroke", stroke: "rgba(0,0,0,0.7)",
            "stroke-width": "0.6"
          }, zone.label));
        }
      } else if (zone.type === "rect") {
        g.append(svg("rect", {
          x: zone.x, y: zone.y, width: zone.w, height: zone.h,
          fill: data.color, stroke: data.stroke,
          "stroke-width": 0.8, rx: 4
        }));
      } else if (zone.type === "polygon") {
        g.append(svg("polygon", {
          points: zone.points,
          fill: data.color, stroke: data.stroke,
          "stroke-width": 0.8
        }));
      }
    });
    els.overlayZones.append(g);
  });

  // Section
  if (isWaterChecked && Array.isArray(window.MAP_WATER_LABELS)) {
    const g = svg("g", { class: "overlay-water-labels" });
    window.MAP_WATER_LABELS.forEach(item => {
      const point = gameToMap(item.x, item.y);
      const sx = point.x;
      const sy = point.y;
      const lines = item.label.split(/<br\s*\/?>/i);
      
      lines.forEach((line, index) => {
        g.append(svg("text", {
          x: sx, y: sy + (index * 12),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: "#a8e6cf",
          "font-size": "calc(var(--pin-font-size) * 0.9)",
          "paint-order": "stroke", stroke: "rgba(0,0,0,0.6)",
          "stroke-width": "0.6",
          "font-weight": "600"
        }, line.replace(/<[^>]*>?/gm, '')));
      });
    });
    els.overlayZones.append(g);
  }

  // Section
  ["animals", "herbs", "earth"].forEach((key) => {
    const cb = $(`[data-overlay="${key}"]`);
    if (!cb || !cb.checked) return;

    const enabledKeys = new Set(
      $$(`[data-sub-overlay="${key}"]`)
        .filter(el => el.checked)
        .map(el => el.dataset.resourceKey)
    );

    const items = overlays[key];
    if (!items) return;

    const g = svg("g", { class: `overlay-${key}` });
    items.forEach((item) => {
      if (enabledKeys.size > 0 && !enabledKeys.has(item.key)) return;
      
      let iconSize = "calc(var(--resource-icon-size) * 0.85)";
      if (key === "earth") {
        iconSize = "calc(var(--resource-icon-size) * 0.765)";
      }

      // Section
      if (item.emoji && item.emoji.endsWith(".svg")) {
        // Section
        const baseSize = key === "earth" ? 22.95 : 24.6;
        const sizePx = baseSize * (sz / 7);
        const half = sizePx / 2;
        const el = svg("image", {
          href: item.emoji,
          x: item.x - half,
          y: item.y - half,
          width: sizePx,
          height: sizePx,
          class: "resource-icon resource-icon-svg",
          "data-name": item.name,
          "data-updated": item.updated || "",
          "data-coord": item.coord || "",
          "data-x": item.x,
          "data-y": item.y
        });
        g.append(el);
      } else {
        g.append(resourceFallbackElement(item));
      }
    });
    els.overlayResources.append(g);
  });

  // Section
  applyView(false);
}

function renderPins() {
  els.pinOverlay.innerHTML = "";
  const pins = [
    ...state.customPins,
    ...state.sharedMembers.map((member) => ({ ...member, type: "shared", name: member.name || member.species }))
  ];
  
  renderSearchMarkers();

  pins.forEach((pin) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-pin ${pin.type || ""}`;
    if (pin.id === latestHistoryId() && $("#animateLatest")?.checked) {
      button.classList.add("latest");
    }
    button.style.left = `${(pin.x / 1000) * 100}%`;
    button.style.top = `${(pin.y / 1003) * 100}%`;
    if (pin.type === "shared") {
      button.innerHTML = `<span class="pin-label" ${pin.color ? `style="color: ${pin.color}"` : ""}>${escapeHtml(pin.name)}</span>`;
    } else {
      const dotStyle = pin.color ? `style="background: ${pin.color}"` : "";
      button.innerHTML = `<span class="pin-dot" ${dotStyle}></span><span class="pin-label" ${pin.color ? `style="color: ${pin.color}"` : ""}>${escapeHtml(pin.name)}</span>`;
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      centerOn(pin);
    });
    els.pinOverlay.append(button);
  });
  renderFootsteps();
}

function renderFootsteps() {
  els.footstepLayer.innerHTML = "";
  const marker = markerSizeSettings();

  // Section
  if (state.sharedMembers && state.sharedMembers.length) {
    state.sharedMembers.forEach((member) => {
      if (!member.history || !member.history.length) return;
      const color = member.color || userColor(member.steam_id || member.id || member.name);
      const markerIcon = memberMarkerIcon(member);
      const points = member.history.slice(0, 12);
      const path = points.slice().reverse().map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      if (path) {
        els.footstepLayer.append(svg("path", { d: path, class: "footstep shared-footstep", style: `stroke: ${color}; stroke-width: ${marker.lineWidth}; stroke-dasharray: ${marker.dash}`, opacity: "0.6" }));
      }
      points.forEach((point, index) => {
        const opacity = markerHistoryOpacity(index, points.length);
        if (index === 0) {
          appendLatestFootstepRing(point, color, marker, Boolean(markerIcon));
        }
        if (index === 0 && markerIcon) {
          appendFootstepIcon(point, color, marker, markerIcon, "shared-footstep-marker", opacity);
          return;
        }
        els.footstepLayer.append(svg("circle", {
          cx: point.x,
          cy: point.y,
          r: marker.sharedRadius,
          class: index === 0 ? "footstep-point shared-footstep-point latest-footstep-point" : "footstep-point shared-footstep-point",
          style: `fill: ${color}; stroke: rgba(0, 0, 0, 0.92); stroke-width: ${marker.strokeWidth}`,
          opacity: opacity.toFixed(2)
        }));
      });
    });
  }

  // Section
  if (!state.history.length) return;
  const color = currentUserColor();
  const markerIcon = currentUserMarkerIcon();
  const points = state.history.slice(0, 12);
  const path = points.slice().reverse().map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  if (path) {
    els.footstepLayer.append(svg("path", { d: path, class: "footstep", style: `stroke: ${color}; stroke-width: ${marker.lineWidth}; stroke-dasharray: ${marker.dash}` }));
  }
  points.forEach((point, index) => {
    const opacity = markerHistoryOpacity(index, points.length);
    if (index === 0) {
      appendLatestFootstepRing(point, color, marker, Boolean(markerIcon));
    }
    if (index === 0 && markerIcon) {
      appendFootstepIcon(point, color, marker, markerIcon, "", opacity);
      return;
    }
    els.footstepLayer.append(svg("circle", {
      cx: point.x,
      cy: point.y,
      r: marker.localRadius,
      class: index === 0 ? "footstep-point latest-footstep-point" : "footstep-point",
      style: `fill: ${color}; stroke: rgba(0, 0, 0, 0.92); stroke-width: ${marker.strokeWidth}`,
      opacity: opacity.toFixed(2)
    }));
  });
}

function markerSizeSettings() {
  const size = Number($("#markerSize")?.value) || 5;
  const scale = clamp(size / 5, 0.4, 3.6) * 1.1;
  return {
    scale,
    sharedRadius: 1.25 * scale,
    localRadius: 1.5 * scale,
    strokeWidth: 0.45 * scale,
    lineWidth: 1.25 * scale,
    dash: `${0.8 * scale} ${6 * scale}`,
    pulseMin: 1.5 * scale,
    pulseMax: 4.5 * scale,
    searchPulseMax: 6 * scale,
    searchDot: 0.7 * scale,
    iconSize: 5.07 * scale,
    iconBgRadius: 2.5 * scale,
    iconRingMin: 2.81 * scale,
    iconRingMax: 4.29 * scale
  };
}

function scheduleMarkerResize() {
  if (_markerResizeFrame) return;
  _markerResizeFrame = requestAnimationFrame(() => {
    _markerResizeFrame = null;
    renderFootsteps();
    renderSearchMarkers();
  });
}

function saveMapSizePreference() {
  writeJson(MAP_SIZE_PREF_KEY, {
    icons: Number($("#pinFontSize")?.value) || 5,
    markers: Number($("#markerSize")?.value) || 5
  });
}

function loadMapSizePreference() {
  const saved = readJson(MAP_SIZE_PREF_KEY, null);
  const iconSize = clamp(Number(saved?.icons) || 5, 2, 18);
  const markerSize = clamp(Number(saved?.markers) || 5, 2, 18);
  if ($("#pinFontSize")) $("#pinFontSize").value = iconSize;
  if ($("#markerSize")) $("#markerSize").value = markerSize;
  document.documentElement.style.setProperty("--pin-font-size", iconSize + "px");
  document.documentElement.style.setProperty("--resource-icon-size", (iconSize * 4.32) + "px");
  document.documentElement.style.setProperty("--map-icon-scale", iconSize / 5);
}

function markerHistoryOpacity(index, total) {
  if (index <= 0 || total <= 1) return 0.95;
  const t = index / Math.max(1, total - 1);
  return 0.78 - t * 0.5;
}

function renderHistory() {
  if (!els.historyList) return;
  els.historyList.innerHTML = "";
  state.history.slice(0, 12).forEach((point, index) => {
    const item = document.createElement("li");
    item.className = "history-item";
    item.innerHTML = `<strong>${index + 1}. ${escapeHtml(point.name)}</strong><span>${point.code} | ${point.memo || "Normal log"}</span>`;
    item.addEventListener("click", () => centerOn(point));
    els.historyList.append(item);
  });
  renderFootsteps();
}

function bindPhoneShareControls() {
  const openButton = $("#sendToPhone");
  const modal = $("#sendPhoneModal");
  if (!openButton || !modal) return;

  openButton.addEventListener("click", openPhoneShareModal);

  $("#phoneShareCopy")?.addEventListener("click", copyPhoneShareLink);
  $("#phoneShareClose")?.addEventListener("click", () => closePhoneShareModal());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePhoneShareModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("is-hidden")) {
      closePhoneShareModal();
    }
  });
}

function closePhoneShareModal() {
  $("#sendPhoneModal")?.classList.add("is-hidden");
}

async function openPhoneShareModal() {
  const modal = $("#sendPhoneModal");
  const linkInput = $("#phoneShareLink");
  const status = $("#phoneShareStatus");
  const fallback = $("#phoneQrFallback");
  const canvas = $("#phoneQrCanvas");
  const qrImage = $("#phoneQrImage");
  if (!modal || !linkInput || !status) return;

  await ensurePhoneShareRoomReady();
  const link = buildPhoneShareUrl();
  const includesRoom = phoneShareLinkHasRoom(link);
  linkInput.value = link;
  status.textContent = phoneShareStatusText(includesRoom, true);
  fallback?.classList.add("is-hidden");
  if (fallback) fallback.href = link;
  qrImage?.classList.add("is-hidden");
  if (qrImage) qrImage.removeAttribute("src");
  canvas?.classList.remove("is-hidden");
  modal.classList.remove("is-hidden");

  try {
    if (!canvas) throw new Error("QR canvas unavailable");
    const qr = await loadQrLibrary();
    await renderQrToCanvas(canvas, link, qr);
    status.textContent = phoneShareStatusText(includesRoom, false);
  } catch {
    try {
      await renderQrImageFallback(qrImage, canvas, link);
      status.textContent = phoneShareStatusText(includesRoom, false);
    } catch {
      if (canvas) canvas.classList.add("is-hidden");
      qrImage?.classList.add("is-hidden");
      if (fallback) fallback.classList.remove("is-hidden");
      status.textContent = "QR unavailable. Link ready to copy.";
    }
  }
}

function buildPhoneShareUrl() {
  const payload = new URLSearchParams({
    z: state.view.zoom.toFixed(2)
  });
  const latest = state.history[0];
  if (latest) {
    payload.set("px", roundForHash(latest.x));
    payload.set("py", roundForHash(latest.y));
  } else {
    payload.set("x", Math.round(state.view.x));
    payload.set("y", Math.round(state.view.y));
  }
  addRoomShareParams(payload);
  const followId = currentShareFollowId();
  if (payload.has("room") && followId) payload.set("f", followId);
  return `${shareBaseUrl()}#${payload.toString()}`;
}

async function ensurePhoneShareRoomReady() {
  if (typeof chat === "undefined" || chat.currentRoom) return;
  if (typeof bootRoomsAndSocket !== "function") return;

  try {
    await bootRoomsAndSocket();
  } catch {
    // Section
  }
}

function phoneShareLinkHasRoom(link) {
  try {
    const hash = new URL(link).hash.slice(1);
    return new URLSearchParams(hash).has("room");
  } catch {
    return /(?:^|[&#])room=/.test(String(link || ""));
  }
}

function phoneShareStatusText(includesRoom, building) {
  const target = state.history[0] ? "latest coords" : "this map view";
  const roomText = includesRoom ? " + room + live marker" : "";
  return building
    ? `Building ${target}${roomText} QR...`
    : `Scan for ${target}${roomText}`;
}

function addRoomShareParams(payload) {
  const roomId = currentShareRoomId();
  if (!roomId) return;

  payload.set("room", String(roomId));
  const invite = roomInviteForShare(roomId);
  if (invite) payload.set("invite", invite);
}

function currentShareRoomId() {
  if (typeof chat !== "undefined" && chat.currentRoom) return chat.currentRoom;

  const savedRoom = Number(localStorage.getItem("joinedRoomId") || 0);
  if (savedRoom) return savedRoom;

  const personalRoom = Number(localStorage.getItem("personalRoomId") || 0);
  return personalRoom || null;
}

function currentShareFollowId() {
  if (typeof chat === "undefined") return "";
  if (chat.clientInstanceId) return chat.clientInstanceId;
  if (typeof getClientInstanceId === "function") return getClientInstanceId();
  return chat.user?.steam_id || "";
}

function roomInviteForShare(roomId) {
  const savedInvite = localStorage.getItem(`roomInvite:${roomId}`) || "";
  if (savedInvite) return savedInvite;

  if (typeof chat !== "undefined" && Array.isArray(chat.rooms)) {
    const room = chat.rooms.find((item) => Number(item.id) === Number(roomId));
    if (room?.invite_code) return room.invite_code;
  }

  return "";
}

function shareBaseUrl() {
  const current = window.location.href.split("#")[0];
  if (/^https?:/i.test(current)) return current;
  return /^https?:/i.test(window.location.origin || "")
    ? `${window.location.origin}${window.location.pathname}${window.location.search}`
    : "https://myislemap.com/";
}

function roundForHash(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

function restorePhoneLocationFromHash(params) {
  const rawX = Number(params.get("px"));
  const rawY = Number(params.get("py"));
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

  const point = {
    id: "phone-shared-location",
    name: params.get("pn") || "Shared location",
    x: clamp(rawX, 0, 1000),
    y: clamp(rawY, 0, 1003),
    code: params.get("pc") || formatCoord({ x: rawX, y: rawY }),
    memo: "Sent to phone"
  };
  state.history = [
    point,
    ...state.history.filter((item) => !isSameHistoryPoint(item, point))
  ].slice(0, 12);
  return point;
}

function isSameHistoryPoint(a, b) {
  return Math.abs(Number(a?.x) - Number(b?.x)) < 0.01
    && Math.abs(Number(a?.y) - Number(b?.y)) < 0.01;
}

function loadQrLibrary() {
  if (window.QRCode?.toCanvas) return Promise.resolve(window.QRCode);
  if (_qrLibraryPromise) return _qrLibraryPromise;

  _qrLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = QR_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.QRCode?.toCanvas) resolve(window.QRCode);
      else reject(new Error("QR library missing"));
    };
    script.onerror = () => reject(new Error("QR library failed to load"));
    document.head.appendChild(script);
  }).catch((error) => {
    _qrLibraryPromise = null;
    throw error;
  });

  return _qrLibraryPromise;
}

function renderQrToCanvas(canvas, text, qr) {
  return new Promise((resolve, reject) => {
    qr.toCanvas(canvas, text, {
      width: 312,
      margin: 4,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function renderQrImageFallback(image, canvas, link) {
  return new Promise((resolve, reject) => {
    if (!image) {
      reject(new Error("QR image unavailable"));
      return;
    }

    canvas?.classList.add("is-hidden");
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR image failed to load"));
    image.src = `${QR_IMAGE_SERVICE_URL}?size=312x312&ecc=M&margin=14&data=${encodeURIComponent(link)}`;
    image.classList.remove("is-hidden");
  });
}

function createQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || "")));
  const ecl = 1; // Section
  let version = 1;
  let dataCodewords = 0;

  for (; version <= 40; version++) {
    dataCodewords = qrDataCodewordCount(version, ecl);
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords * 8) break;
  }
  if (version > 40) throw new Error("QR payload is too long");

  const data = makeQrDataCodewords(bytes, version, dataCodewords);
  const codewords = addQrErrorCorrection(data, version, ecl);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const functions = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    functions[y][x] = true;
  };

  drawQrFunctionPatterns(version, modules, functions, setFunction);
  drawQrCodewords(codewords, modules, functions);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyQrMask(mask, modules, functions);
    drawQrFormatBits(ecl, mask, modules, setFunction);
    const penalty = qrPenaltyScore(modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyQrMask(mask, modules, functions);
  }

  applyQrMask(bestMask, modules, functions);
  drawQrFormatBits(ecl, bestMask, modules, setFunction);
  return modules;
}

function makeQrDataCodewords(bytes, version, dataCodewords) {
  const bits = [];
  appendQrBits(bits, 0x4, 4);
  appendQrBits(bits, bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => appendQrBits(bits, byte, 8));

  const capacity = dataCodewords * 8;
  appendQrBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    result.push(value);
  }

  for (let pad = 0xec; result.length < dataCodewords; pad ^= 0xfd) {
    result.push(pad);
  }
  return result;
}

function appendQrBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

function addQrErrorCorrection(data, version, ecl) {
  const rawCodewords = qrRawCodewordCount(version);
  const blockCount = QR_EC_BLOCKS[ecl][version];
  const eccLength = QR_EC_CODEWORDS[ecl][version];
  const shortBlockCount = blockCount - rawCodewords % blockCount;
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const generator = qrReedSolomonGenerator(eccLength);
  const blocks = [];
  let offset = 0;

  for (let i = 0; i < blockCount; i++) {
    const dataLength = shortBlockLength - eccLength + (i < shortBlockCount ? 0 : 1);
    const dataBlock = data.slice(offset, offset + dataLength);
    offset += dataLength;
    const eccBlock = qrReedSolomonRemainder(dataBlock, generator);
    if (i < shortBlockCount) dataBlock.push(0);
    blocks.push(dataBlock.concat(eccBlock));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, blockIndex) => {
      if (i !== shortBlockLength - eccLength || blockIndex >= shortBlockCount) {
        result.push(block[i]);
      }
    });
  }
  return result;
}

function drawQrFunctionPatterns(version, modules, functions, setFunction) {
  const size = modules.length;
  drawQrFinderPattern(0, 0, setFunction);
  drawQrFinderPattern(size - 7, 0, setFunction);
  drawQrFinderPattern(0, size - 7, setFunction);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }

  const align = qrAlignmentPatternPositions(version);
  align.forEach((x) => {
    align.forEach((y) => {
      if (functions[y][x]) return;
      drawQrAlignmentPattern(x, y, setFunction);
    });
  });

  drawQrFormatBits(1, 0, modules, setFunction);
  drawQrVersionBits(version, setFunction);
}

function drawQrFinderPattern(left, top, setFunction) {
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      const xx = left + x;
      const yy = top + y;
      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const dark = inFinder && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      setFunction(xx, yy, dark);
    }
  }
}

function drawQrAlignmentPattern(cx, cy, setFunction) {
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      setFunction(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  }
}

function drawQrFormatBits(ecl, mask, modules, setFunction) {
  const size = modules.length;
  const eclFormatBits = [1, 0, 3, 2][ecl];
  let data = (eclFormatBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setFunction(8, i, qrBit(bits, i));
  setFunction(8, 7, qrBit(bits, 6));
  setFunction(8, 8, qrBit(bits, 7));
  setFunction(7, 8, qrBit(bits, 8));
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, qrBit(bits, i));
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, qrBit(bits, i));
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, qrBit(bits, i));
  setFunction(8, size - 8, true);
}

function drawQrVersionBits(version, setFunction) {
  if (version < 7) return;
  const size = version * 4 + 17;
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = qrBit(bits, i);
    const a = size - 11 + i % 3;
    const b = Math.floor(i / 3);
    setFunction(a, b, bit);
    setFunction(b, a, bit);
  }
}

function drawQrCodewords(codewords, modules, functions) {
  const size = modules.length;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (functions[y][x] || bitIndex >= codewords.length * 8) continue;
        modules[y][x] = qrBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
        bitIndex++;
      }
    }
  }
}

function applyQrMask(mask, modules, functions) {
  modules.forEach((row, y) => {
    row.forEach((_, x) => {
      if (!functions[y][x] && qrMaskBit(mask, x, y)) {
        modules[y][x] = !modules[y][x];
      }
    });
  });
}

function qrMaskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    default: return false;
  }
}

function qrPenaltyScore(modules) {
  const size = modules.length;
  let penalty = 0;

  for (let y = 0; y < size; y++) penalty += qrLinePenalty(modules[y]);
  for (let x = 0; x < size; x++) penalty += qrLinePenalty(modules.map((row) => row[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
        penalty += 3;
      }
    }
  }

  for (let y = 0; y < size; y++) penalty += qrFinderPenalty(modules[y]);
  for (let x = 0; x < size; x++) penalty += qrFinderPenalty(modules.map((row) => row[x]));

  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  penalty += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return penalty;
}

function qrLinePenalty(line) {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === runColor) {
      runLength++;
    } else {
      if (runLength >= 5) penalty += 3 + runLength - 5;
      runColor = line[i];
      runLength = 1;
    }
  }
  return penalty;
}

function qrFinderPenalty(line) {
  let penalty = 0;
  for (let i = 0; i <= line.length - 7; i++) {
    const matches = line[i] && !line[i + 1] && line[i + 2] && line[i + 3] && line[i + 4] && !line[i + 5] && line[i + 6];
    if (!matches) continue;
    const before = i >= 4 && !line[i - 1] && !line[i - 2] && !line[i - 3] && !line[i - 4];
    const after = i + 11 <= line.length && !line[i + 7] && !line[i + 8] && !line[i + 9] && !line[i + 10];
    if (before || after) penalty += 40;
  }
  return penalty;
}

function qrAlignmentPatternPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function qrDataCodewordCount(version, ecl) {
  return qrRawCodewordCount(version) - QR_EC_CODEWORDS[ecl][version] * QR_EC_BLOCKS[ecl][version];
}

function qrRawCodewordCount(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

function qrReedSolomonGenerator(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = qrReedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = qrReedSolomonMultiply(root, 0x02);
  }
  return result;
}

function qrReedSolomonRemainder(data, generator) {
  const result = Array(generator.length).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    generator.forEach((coef, i) => {
      result[i] ^= qrReedSolomonMultiply(coef, factor);
    });
  });
  return result;
}

function qrReedSolomonMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = ((z << 1) ^ ((z >>> 7) * 0x11d)) & 0xff;
    if (((y >>> i) & 1) !== 0) z ^= x;
  }
  return z;
}

function qrBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

async function copyPhoneShareLink() {
  const input = $("#phoneShareLink");
  const status = $("#phoneShareStatus");
  const link = input?.value || buildPhoneShareUrl();
  try {
    await navigator.clipboard.writeText(link);
    if (status) status.textContent = "Phone link copied";
  } catch {
    if (input) {
      input.focus();
      input.select();
    }
    if (status) status.textContent = "Select the link to copy it";
  }
}

function bindOcrControls() {
  const start = $("#ocrStart");
  if (!start) return;

  loadOcrCropPreference();
  start.addEventListener("click", () => {
    if (ocrState.stream) stopOcrTracking();
    else startOcrTracking();
  });
  ["#ocrCropX", "#ocrCropY", "#ocrCropW", "#ocrCropH"].forEach((selector) => {
    const input = $(selector);
    if (input) input.addEventListener("input", () => {
      updateOcrCrop();
      saveOcrCropPreference();
    });
  });
  updateOcrCrop();
}

function loadOcrCropPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(OCR_CROP_PREF_KEY) || "null");
    if (!saved || typeof saved !== "object") return;

    [
      ["ocrCropX", saved.x],
      ["ocrCropY", saved.y],
      ["ocrCropW", saved.w],
      ["ocrCropH", saved.h]
    ].forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input || value === undefined) return;
      input.value = clamp(Number(value), Number(input.min), Number(input.max));
    });
  } catch {
    localStorage.removeItem(OCR_CROP_PREF_KEY);
  }
}

function saveOcrCropPreference() {
  const crop = {
    x: Number($("#ocrCropX")?.value || 0),
    y: Number($("#ocrCropY")?.value || 0),
    w: Number($("#ocrCropW")?.value || 40),
    h: Number($("#ocrCropH")?.value || 12)
  };
  localStorage.setItem(OCR_CROP_PREF_KEY, JSON.stringify(crop));
}

function loadOcrLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_ocrLibraryPromise) return _ocrLibraryPromise;

  setOcrStatus("Loading OCR...");
  _ocrLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-ocr-library="tesseract"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Tesseract), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = OCR_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.ocrLibrary = "tesseract";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = reject;
    document.head.append(script);
  }).then((library) => {
    if (!library) throw new Error("Tesseract did not initialize.");
    return library;
  }).catch((err) => {
    _ocrLibraryPromise = null;
    throw err;
  });

  return _ocrLibraryPromise;
}

async function startOcrTracking() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setOcrStatus("Screen capture is not supported in this browser.");
    return;
  }

  try {
    await loadOcrLibrary();
  } catch {
    setOcrStatus("OCR library could not load. Check your connection and try again.");
    return;
  }

  try {
    stopOcrTracking(false);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor",
        frameRate: { ideal: 2, max: 4 }
      },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      monitorTypeSurfaces: "include"
    });
    ocrState.stream = stream;
    const video = $("#ocrVideo");
    const preview = $("#ocrPreview");
    video.srcObject = stream;
    await video.play();
    preview?.classList.remove("is-hidden");
    $("#ocrZoom")?.classList.remove("is-hidden");
    setOcrRunningUi(true);
    const track = stream.getVideoTracks()[0];
    track?.addEventListener("ended", () => stopOcrTracking());
    if (window.ImageCapture && track) {
      try {
        ocrState.imageCapture = new ImageCapture(track);
      } catch {
        ocrState.imageCapture = null;
      }
    }
    const settings = track?.getSettings?.() || {};
    const source = settings.displaySurface ? `${settings.displaySurface} capture` : "screen capture";
    setOcrStatus(`Preparing OCR from ${source}...`);
    await ensureOcrWorker();
    setOcrStatus(`OCR running from ${source}. Use entire screen/borderless game for background tracking.`);
    updateOcrZoom();
    await requestOcrWakeLock();
    startOcrTimers(video);
    setTimeout(() => captureOcrFrame(false), 700);
  } catch (err) {
    setOcrStatus("Screen capture was not started.");
  }
}

function stopOcrTracking(updateStatus = true) {
  stopOcrTimers();
  ocrState.busy = false;
  releaseOcrWakeLock();
  if (ocrState.stream) {
    ocrState.stream.getTracks().forEach(track => track.stop());
  }
  ocrState.stream = null;
  ocrState.imageCapture = null;
  ocrState.pendingPoint = null;
  ocrState.pendingAt = 0;
  const video = $("#ocrVideo");
  if (video) video.srcObject = null;
  $("#ocrPreview")?.classList.add("is-hidden");
  $("#ocrZoom")?.classList.add("is-hidden");
  setOcrRunningUi(false);
  if (updateStatus) setOcrStatus("OCR is off");
}

function setOcrRunningUi(isRunning) {
  const button = $("#ocrStart");
  if (!button) return;
  button.textContent = isRunning ? "Stop OCR" : "Start OCR";
  button.classList.toggle("is-running", isRunning);
}

function startOcrTimers(video) {
  stopOcrTimers();

  ocrState.previewTimer = setInterval(updateOcrZoom, OCR_PREVIEW_INTERVAL_MS);
  const hasFrameLoop = startOcrFrameLoop(video);
  const backupInterval = hasFrameLoop ? OCR_BACKUP_INTERVAL_MS : OCR_CAPTURE_INTERVAL_MS;

  if (window.Worker && window.URL) {
    const workerScript = `
      let timer = null;
      self.onmessage = (event) => {
        const data = event.data || {};
        const type = typeof data === "string" ? data : data.type;
        if (type === "start") {
          clearInterval(timer);
          timer = setInterval(() => self.postMessage("tick"), data.interval || 3500);
        }
        if (type === "stop") {
          clearInterval(timer);
          timer = null;
        }
      };
    `;
    const workerUrl = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    worker.onmessage = () => captureOcrFrame(false);
    worker.postMessage({ type: "start", interval: backupInterval });
    ocrState.timerWorker = worker;
  } else {
    ocrState.timer = setInterval(() => captureOcrFrame(false), backupInterval);
  }
}

function stopOcrTimers() {
  if (ocrState.timer) clearInterval(ocrState.timer);
  if (ocrState.previewTimer) clearInterval(ocrState.previewTimer);
  const video = $("#ocrVideo");
  if (ocrState.frameRequest && video?.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(ocrState.frameRequest);
  }
  if (ocrState.timerWorker) {
    ocrState.timerWorker.postMessage("stop");
    ocrState.timerWorker.terminate();
  }
  ocrState.timer = null;
  ocrState.previewTimer = null;
  ocrState.frameRequest = null;
  ocrState.timerWorker = null;
}

function startOcrFrameLoop(video) {
  if (!video?.requestVideoFrameCallback) return false;

  const readFromFrame = (now) => {
    if (!ocrState.stream) return;
    if (!ocrState.busy && now - ocrState.lastOcrAt > OCR_CAPTURE_INTERVAL_MS) {
      ocrState.lastOcrAt = now;
      captureOcrFrame(false);
    }
    ocrState.frameRequest = video.requestVideoFrameCallback(readFromFrame);
  };

  ocrState.frameRequest = video.requestVideoFrameCallback(readFromFrame);
  return true;
}

async function requestOcrWakeLock() {
  if (!navigator.wakeLock?.request) return;
  try {
    ocrState.wakeLock = await navigator.wakeLock.request("screen");
    ocrState.wakeLock.addEventListener?.("release", () => {
      ocrState.wakeLock = null;
    });
  } catch {
    ocrState.wakeLock = null;
  }
}

function releaseOcrWakeLock() {
  if (!ocrState.wakeLock) return;
  ocrState.wakeLock.release?.();
  ocrState.wakeLock = null;
}

async function ensureOcrWorker() {
  const library = await loadOcrLibrary();
  if (ocrState.ocrWorker || ocrState.ocrWorkerPromise || !library?.createWorker) {
    return ocrState.ocrWorkerPromise;
  }

  ocrState.ocrWorkerPromise = library.createWorker("eng")
    .then(async (worker) => {
      ocrState.ocrWorker = worker;
      if (worker.setParameters) {
        try {
          await worker.setParameters(OCR_TESSERACT_PARAMS);
        } catch {}
      }
      return worker;
    })
    .catch(() => {
      ocrState.ocrWorker = null;
      return null;
    });

  return ocrState.ocrWorkerPromise;
}

async function recognizeOcrCanvas(canvas) {
  const worker = ocrState.ocrWorker || await ensureOcrWorker();
  if (worker?.recognize) {
    return worker.recognize(canvas);
  }
  const library = await loadOcrLibrary();
  return library.recognize(canvas, "eng");
}

async function captureOcrFrame(forceStatus = false) {
  if (ocrState.busy) return;
  try {
    await loadOcrLibrary();
  } catch {
    setOcrStatus("OCR library could not load. Check your connection and try again.");
    return;
  }

  const source = await getOcrFrameSource();
  if (!source) {
    if (forceStatus) setOcrStatus("Start OCR and share your game/window first.");
    return;
  }

  ocrState.busy = true;
  try {
    const crop = getOcrCrop(source.width, source.height);
    const target = getOcrCanvasSize(crop);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;
    ctx.filter = "grayscale(1) contrast(1.8) brightness(1.1)";
    ctx.drawImage(source.image, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    drawOcrZoom(source.image, crop);

    const result = await recognizeOcrCanvas(canvas);
    const text = normalizeOcrText(result?.data?.text || "");
    const candidate = findOcrCoordinateCandidate(text);
    if (!candidate?.text) {
      if (candidate?.rejectionReason === "edge") {
        setOcrStatus("Ignored OCR coordinates too close to the map edge.");
        return;
      }
      if (candidate?.rejectionReason === "outside") {
        setOcrStatus("Ignored invalid OCR coordinates outside the map.");
        return;
      }
      setOcrStatus(text ? `No coords found in: ${text.slice(0, 90)}` : "No OCR text found.");
      return;
    }

    const confirmation = confirmOcrCandidate(candidate);
    if (!confirmation.accepted) {
      setOcrStatus(`Verifying ${candidate.text}...`);
      return;
    }

    const candidateText = candidate.text;
    ocrState.lastPoint = candidate.point;
    if (candidateText !== ocrState.lastText) {
      ocrState.lastText = candidateText;
      runLocationSearch(candidateText);
      setOcrStatus(`Tracked ${candidateText}`);
    } else if (forceStatus) {
      setOcrStatus(`Already at ${candidateText}`);
    }
  } catch (err) {
    setOcrStatus("OCR read failed. Try a tighter crop or clearer text.");
  } finally {
    if (source.close) source.close();
    ocrState.busy = false;
  }
}

function getOcrCanvasSize(crop) {
  const sourceW = Math.max(1, Number(crop?.w) || 1);
  const sourceH = Math.max(1, Number(crop?.h) || 1);
  const scale = Math.min(
    OCR_CANVAS_MAX_SCALE,
    OCR_CANVAS_MAX_WIDTH / sourceW,
    OCR_CANVAS_MAX_HEIGHT / sourceH
  );
  return {
    width: Math.max(1, Math.round(sourceW * scale)),
    height: Math.max(1, Math.round(sourceH * scale))
  };
}

async function getOcrFrameSource() {
  const video = $("#ocrVideo");
  if (video?.videoWidth && video?.videoHeight) {
    return {
      image: video,
      width: video.videoWidth,
      height: video.videoHeight,
      close: null
    };
  }

  if (ocrState.imageCapture?.grabFrame) {
    try {
      const bitmap = await ocrState.imageCapture.grabFrame();
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      };
    } catch {}
  }

  return null;
}

function updateOcrCrop() {
  const crop = $("#ocrCrop");
  if (!crop) return;
  const x = Number($("#ocrCropX")?.value || 0);
  const y = Number($("#ocrCropY")?.value || 0);
  const w = Number($("#ocrCropW")?.value || 40);
  const h = Number($("#ocrCropH")?.value || 12);
  crop.style.left = `${x}%`;
  crop.style.top = `${y}%`;
  crop.style.width = `${Math.min(w, 100 - x)}%`;
  crop.style.height = `${Math.min(h, 100 - y)}%`;
  updateOcrZoom();
}

function getOcrCrop(width, height) {
  const px = Number($("#ocrCropX")?.value || 0) / 100;
  const py = Number($("#ocrCropY")?.value || 0) / 100;
  const pw = Number($("#ocrCropW")?.value || 40) / 100;
  const ph = Number($("#ocrCropH")?.value || 12) / 100;
  const x = Math.round(width * px);
  const y = Math.round(height * py);
  const w = Math.round(width * Math.min(pw, 1 - px));
  const h = Math.round(height * Math.min(ph, 1 - py));
  return { x, y, w, h };
}

function updateOcrZoom() {
  const video = $("#ocrVideo");
  if (!video?.videoWidth || !video?.videoHeight) return;
  drawOcrZoom(video, getOcrCrop(video.videoWidth, video.videoHeight));
}

function drawOcrZoom(video, crop) {
  const canvas = $("#ocrZoom");
  if (!canvas || !crop.w || !crop.h) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#020608";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / crop.w, canvas.height / crop.h);
  const drawW = Math.max(1, crop.w * scale);
  const drawH = Math.max(1, crop.h * scale);
  const x = (canvas.width - drawW) / 2;
  const y = (canvas.height - drawH) / 2;
  ctx.filter = "contrast(1.6) brightness(1.08)";
  ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, x, y, drawW, drawH);
  ctx.filter = "none";
  ctx.strokeStyle = "#e9c46a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, drawW - 2, drawH - 2);
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/[|]/g, "1")
    .replace(/[Oo]/g, "0")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function findOcrCoordinateCandidate(text) {
  const raw = String(text || "");
  if (!/\blat\b/i.test(raw) || !/\bl(?:o|0)ng\b/i.test(raw)) {
    return null;
  }
  const chunks = [
    ...raw.split(/[;\n\r]+/),
    raw
  ].map(s => s.replace(/\b(?:alt|altitude|z)\b\s*[:=]?\s*-?\d+(?:\.\d+)?/ig, "").trim()).filter(Boolean);

  let rejectionReason = "";
  for (const chunk of chunks) {
    const parsed = parseLabeledLatLong(chunk);
    if (!parsed) continue;
    const validation = validateOcrCoordinates(parsed.lat, parsed.long);
    if (validation.valid) {
      return { text: validation.point.code, point: validation.point, rejectionReason: "" };
    }
    if (!rejectionReason) rejectionReason = validation.reason;
  }


  return { text: "", point: null, rejectionReason };
}

function confirmOcrCandidate(candidate, now = Date.now()) {
  const point = candidate?.point;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { accepted: false, reason: "invalid" };
  }

  if (ocrState.lastPoint && ocrPointDistance(point, ocrState.lastPoint) <= OCR_NEARBY_DISTANCE) {
    ocrState.pendingPoint = null;
    ocrState.pendingAt = 0;
    return { accepted: true, reason: "nearby" };
  }

  const pendingIsFresh = ocrState.pendingPoint && now - ocrState.pendingAt <= OCR_CONFIRM_WINDOW_MS;
  if (pendingIsFresh && ocrPointDistance(point, ocrState.pendingPoint) <= OCR_CONFIRM_DISTANCE) {
    ocrState.pendingPoint = null;
    ocrState.pendingAt = 0;
    return { accepted: true, reason: "confirmed" };
  }

  ocrState.pendingPoint = { x: point.x, y: point.y };
  ocrState.pendingAt = now;
  return { accepted: false, reason: "pending" };
}

function ocrPointDistance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function validateOcrCoordinates(lat, long) {
  const point = gameToMap(lat, long, false);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { valid: false, point: null, reason: "invalid" };
  }

  if (point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 1003) {
    return { valid: false, point, reason: "outside" };
  }

  const nearEdge = (
    point.x < OCR_MAP_EDGE_MARGIN ||
    point.x > 1000 - OCR_MAP_EDGE_MARGIN ||
    point.y < OCR_MAP_EDGE_MARGIN ||
    point.y > 1003 - OCR_MAP_EDGE_MARGIN
  );
  if (nearEdge) {
    return { valid: false, point, reason: "edge" };
  }

  return { valid: true, point, reason: "" };
}

function setOcrStatus(message) {
  const status = $("#ocrStatus");
  if (status) status.textContent = message;
}

function runLocationSearch(raw) {
  const query = raw.trim();
  if (!query) return;
  const named = findPinByName(query);
  const point = named || parseLocation(query);
  if (!point) {
    els.hoverCoord.textContent = "No location found";
    return;
  }
  const trackedAt = Date.now();
  const location = {
    id: `history-${trackedAt}`,
    name: named ? named.name : query,
    x: point.x,
    y: point.y,
    at: trackedAt,
    code: point.code || formatCoord(point),
    memo: state.historyMode === "target" ? "Targeting log" : "Normal log"
  };
  state.history.unshift(location);
  state.history = state.history.slice(0, 12);
  
  state.history.forEach((point, i) => {
    if (i === 0) renderSearchMarkers();
  });

  if (state.history.length > 0) {
    centerOn({ x: state.history[0].x, y: state.history[0].y, id: latestHistoryId() });
  }

  renderHistory();
  renderPins();
  persist();
  updatePrimeTrackerForPoint(location);

  queueLocationBroadcast(state.history);
}

// Section

function queueLocationBroadcast(history) {
  if (typeof chat === "undefined" || typeof chat.broadcastLocation !== "function") return;

  const latest = history?.[0];
  const key = latest ? `${Math.round(latest.x * 10) / 10},${Math.round(latest.y * 10) / 10}:${latest.code || ""}` : "empty";
  const now = performance.now();
  const elapsed = now - _lastLocationBroadcastAt;

  _pendingLocationHistory = history;

  if (key === _lastLocationBroadcastKey && elapsed < 5000) {
    return;
  }

  if (elapsed >= 1000) {
    flushLocationBroadcast(key);
    return;
  }

  if (!_locationBroadcastTimer) {
    _locationBroadcastTimer = setTimeout(() => flushLocationBroadcast(), 1000 - elapsed);
  }
}

function flushLocationBroadcast(keyOverride = "") {
  if (_locationBroadcastTimer) {
    clearTimeout(_locationBroadcastTimer);
    _locationBroadcastTimer = null;
  }
  if (!_pendingLocationHistory || typeof chat === "undefined" || typeof chat.broadcastLocation !== "function") return;

  const latest = _pendingLocationHistory?.[0];
  _lastLocationBroadcastKey = keyOverride || (latest ? `${Math.round(latest.x * 10) / 10},${Math.round(latest.y * 10) / 10}:${latest.code || ""}` : "empty");
  _lastLocationBroadcastAt = performance.now();
  chat.broadcastLocation(_pendingLocationHistory);
  _pendingLocationHistory = null;
}

let _heatmapCache = null;
let _heatmapFetchedAt = 0;
const HEATMAP_TTL = 5 * 60 * 1000; // Section

async function renderHeatmap() {
  const canvas = document.getElementById("heatmapCanvas");
  if (!canvas) return;

  // Section
  const mapImg = document.getElementById("realMapImage");
  const W = mapImg ? mapImg.naturalWidth  || 1000 : 1000;
  const H = mapImg ? mapImg.naturalHeight || 1003 : 1003;
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // Section
  const now = Date.now();
  if (!_heatmapCache || now - _heatmapFetchedAt > HEATMAP_TTL) {
    try {
      const res = await fetch("/api/heatmap?days=30");
      _heatmapCache = await res.json();
      _heatmapFetchedAt = now;
    } catch (e) {
      console.warn("Heatmap fetch failed:", e);
      return;
    }
  }

  const points = _heatmapCache;
  if (!points || !points.length) return;

  const maxWeight = Math.max(1, ...points.map(p => Number(p.weight) || 0));

  // Section
  // Section
  const baseRadius = Math.max(W, H) * 0.025; // Section
  
  // Section
  // Section
  const offscreen = document.createElement("canvas");
  offscreen.width = W;
  offscreen.height = H;
  const off = offscreen.getContext("2d");
  off.globalCompositeOperation = "lighter"; // Section

  for (const { nx, ny, weight } of points) {
    const px = nx * W;
    const py = ny * H;
    const bucketWeight = Math.max(0, Number(weight) || 0);
    const t = maxWeight > 1 ? Math.log1p(bucketWeight) / Math.log1p(maxWeight) : 0.25;
    const r  = baseRadius * (0.5 + t * 1.5);   // Section
    const centerAlpha = 0.18 + t * 0.62;
    const midAlpha = 0.06 + t * 0.2;

    const grad = off.createRadialGradient(px, py, 0, px, py, r);
    // Section
    grad.addColorStop(0,   `rgba(255,255,255,${centerAlpha.toFixed(2)})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${midAlpha.toFixed(2)})`);
    grad.addColorStop(1,   "rgba(255,255,255,0)");

    off.fillStyle = grad;
    off.beginPath();
    off.arc(px, py, r, 0, Math.PI * 2);
    off.fill();
  }

  // Section
  // Section
  const imgData = off.getImageData(0, 0, W, H);
  const colorOut = ctx.createImageData(W, H);

  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = imgData.data[i + 3] / 255; // Section
    if (v < 0.01) { colorOut.data[i+3] = 0; continue; } // Section

    let r2, g2, b2;
    if (v < 0.25) {
      // Section
      const t2 = v / 0.25;
      r2 = 0; g2 = Math.round(255 * t2); b2 = 255;
    } else if (v < 0.5) {
      // Section
      const t2 = (v - 0.25) / 0.25;
      r2 = 0; g2 = 255; b2 = Math.round(255 * (1 - t2));
    } else if (v < 0.75) {
      // Section
      const t2 = (v - 0.5) / 0.25;
      r2 = Math.round(255 * t2); g2 = 255; b2 = 0;
    } else {
      // Section
      const t2 = (v - 0.75) / 0.25;
      r2 = 255; g2 = Math.round(255 * (1 - t2)); b2 = 0;
    }

    colorOut.data[i]   = r2;
    colorOut.data[i+1] = g2;
    colorOut.data[i+2] = b2;
    colorOut.data[i+3] = Math.round(v * 150); // Section
  }

  ctx.putImageData(colorOut, 0, 0);
  _heatmapDrawnAt = Date.now();
}

function renderSearchMarkers() {
  const old = document.getElementById("searchMarkers");
  if (old) old.remove();
  
  // Section
  const oldSingle = document.getElementById("searchMarker");
  if (oldSingle) oldSingle.remove();

  const container = svg("g", { id: "searchMarkers" });

  const markers = [];
  
  if (state.history && state.history.length > 0) {
    const point = state.history[0];
    const color = currentUserColor();
    markers.push({ point, color });
  }

  const marker = markerSizeSettings();

  markers.forEach(({ point, color }) => {
    const g = svg("g", { "data-x": point.x, "data-y": point.y });
    const ring = svg("circle", { cx: point.x, cy: point.y, r: marker.pulseMin, fill: "none", stroke: color, "stroke-width": 0.3 * marker.scale });
    if (isMobileViewport()) {
      ring.setAttribute("opacity", "0.72");
    } else {
      ring.innerHTML = `<animate attributeName="r" values="${marker.pulseMin};${marker.searchPulseMax};${marker.pulseMin}" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="1.4s" repeatCount="indefinite"/>`;
    }
    g.append(ring);
    g.append(svg("circle", { cx: point.x, cy: point.y, r: marker.searchDot, fill: color }));
    container.append(g);
  });

  els.gridLayer.after(container);
  applyView(false);
}

function parseLocation(query) {
  const trimmed = query.trim();

  const labeled = parseLabeledLatLong(trimmed);
  if (labeled) {
    return gameToMap(labeled.lat, labeled.long);
  }

  // Section
  const grid = trimmed.match(/^([a-t])\s*(\d{1,2})$/i);
  if (grid) {
    const col = grid[1].toUpperCase().charCodeAt(0) - 64;
    const row = Number(grid[2]);
    return {
      x: clamp((col - 0.5) * (1000 / 20), 0, 1000),
      y: clamp((row - 0.5) * (1003 / 20), 0, 1003),
      code: `${grid[1].toUpperCase()}${row}`
    };
  }

  // Section
  // Section
  // Section
  const parts = trimmed
    .replace(/\balt(?:itude)?\b\s*[:=]?\s*-?\d+(?:\.\d+)?/ig, "")
    .split(/,\s+/)
    .map(s => parseFloat(s.replace(/,/g, '')));
  const validParts = parts.filter(n => !isNaN(n));
  if (validParts.length >= 2) {
    return gameToMap(validParts[0], validParts[1]); // Section
  }

  // Section
  const withoutAlt = trimmed.replace(/\b(?:alt|altitude|z)\b\s*[:=]?\s*-?\d+(?:\.\d+)?/ig, "");
  const nums = withoutAlt.replace(/,/g, '').match(/-?\d+(\.\d+)?/g);
  if (nums && nums.length >= 2) {
    return gameToMap(parseFloat(nums[0]), parseFloat(nums[1]));
  }

  return null;
}

function parseLabeledLatLong(query) {
  const text = String(query || "")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/\balt(?:itude)?\b\s*[:=]?\s*-?[\d,.'\s]+(?:[.,]\d+)?/ig, " ");
  const latSection = text.match(/\blat\b\s*[:=]?\s*([\s\S]*?)\bl(?:o|0)ng\b/i);
  const longSection = text.match(/\bl(?:o|0)ng\b\s*[:=]?\s*([\s\S]*?)(?:\b(?:alt|altitude|z)\b|$)/i);

  if (!latSection || !longSection) return null;

  const lat = parseMapNumber(extractFirstMapNumber(latSection[1]));
  const long = parseMapNumber(extractFirstMapNumber(longSection[1]));
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;

  return { lat, long };
}

function extractFirstMapNumber(value) {
  const normalized = String(value || "")
    .replace(/[|Il]/g, "1")
    .replace(/[Oo]/g, "0");
  const match = normalized.match(/(?:^|[^A-Za-z0-9])([-+]?(?:\d{1,3}(?:[,' ]\d{3})+|\d+)(?:[.,]\d+)?)(?![A-Za-z0-9])/);
  return match ? match[1] : "";
}

function parseMapNumber(value) {
  const clean = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[']/g, "");
  if (!clean) return NaN;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    return Number(clean.replaceAll(thousands, "").replace(decimal, "."));
  }

  if (lastComma > -1) {
    const right = clean.slice(lastComma + 1);
    if (right.length === 3 && /^\d{3}$/.test(right)) {
      return Number(clean.replaceAll(",", ""));
    }
    return Number(clean.replace(",", "."));
  }

  return Number(clean);
}

function findPinByName(query) {
  const term = query.toLowerCase();
  
  // Section
  const custom = state.customPins.find((pin) => pin.name.toLowerCase().includes(term));
  if (custom) return custom;
  
  // Section
  if (typeof MAP_OVERLAYS !== "undefined") {
    for (const key of ['sanctuary', 'patrol', 'migration']) {
      const data = MAP_OVERLAYS[key];
      if (!data || !data.zones) continue;
      
      const zone = data.zones.find(z => zoneSearchText(z).includes(term));
      if (zone) {
        const anchor = zoneLabelAnchor(zone) || { x: 0, y: 0 };
        return { name: zoneDisplayName(zone), x: anchor.x, y: anchor.y };
      }
    }
  }

  // Section
  if (typeof MAP_WATER_LABELS !== "undefined") {
    const water = MAP_WATER_LABELS.find(w => w.label && w.label.replace(/<[^>]*>?/gm, ' ').toLowerCase().includes(term));
    if (water) {
      const p = gameToMap(water.x, water.y);
      return { name: water.label.replace(/<[^>]*>?/gm, ' ').trim(), x: p.x, y: p.y };
    }
  }

  // Section
  if (typeof MAP_OVERLAYS !== "undefined") {
    for (const key of ['animals', 'herbs', 'earth']) {
      const data = MAP_OVERLAYS[key];
      if (!data) continue;
      const item = data.find(i => i.name && i.name.toLowerCase().includes(term));
      if (item) {
        return { name: item.name, x: item.x, y: item.y };
      }
    }
  }

  return null;
}



function measure(point) {
  if (!state.measureStart) {
    state.measureStart = point;
    els.hoverCoord.textContent = `Measure start ${formatCoord(point)}`;
    return;
  }
  const dist = Math.round(distance(state.measureStart, point) * 5.8);
  const line = svg("path", {
    class: "measure-line",
    d: `M ${state.measureStart.x} ${state.measureStart.y} L ${point.x} ${point.y}`
  });
  els.footstepLayer.append(line);
  els.hoverCoord.textContent = `Distance about ${dist}m`;
  state.measureStart = null;
}

function setMode(mode) {
  state.mode = mode;
  if ($("#measureMode")) $("#measureMode").classList.toggle("is-selected", mode === "measure");
  if (els.mapStatus) els.mapStatus.dataset.mode = mode || "";
  els.hoverCoord.textContent = mode === "measure" ? "Click two points to measure" : "Move over map";
}

function centerOn(point) {
  const rect = els.viewport.getBoundingClientRect();
  const sx = (point.x / 1000 - 0.5) * baseStageWidth();
  const sy = (point.y / 1003 - 0.5) * baseStageHeight();
  state.view.x = -sx * state.view.zoom;
  state.view.y = -sy * state.view.zoom;
  if (rect.width < 900) {
    els.sidebar.classList.remove("is-open");
  }
  applyView();
  persist();
}

function focusLatest() {
  if (state.history[0]) {
    centerOn(state.history[0]);
  }
}

function setZoom(value, save = true) {
  state.view.zoom = clamp(Number(value), 0.25, 9);
  $("#zoomRange").value = state.view.zoom;
  applyView(save);
}

function applyView(save = true) {
  const { zoom, x, y } = state.view;
  const width = Math.max(1, Math.round(baseMapCssWidth() * zoom));
  const height = Math.max(1, Math.round(baseMapCssHeight() * zoom));
  els.stage.style.width = `${width}px`;
  els.stage.style.height = `${height}px`;
  els.stage.style.left = `calc(50% + ${Math.round(x - width / 2)}px)`;
  els.stage.style.top = `calc(50% + ${Math.round(y - height / 2)}px)`;
  els.stage.style.transform = "none";
  const scaleText = `${zoom.toFixed(2)}x`;
  if (_lastScaleReadout !== scaleText) {
    els.scaleReadout.textContent = scaleText;
    _lastScaleReadout = scaleText;
  }
  const s = 1 / zoom;

  // Section
  // Section
  document.documentElement.style.setProperty("--stage-inverse-zoom", s);

  if (useMobileResourceLod()) {
    scheduleMobileResourceRender(save ? 80 : 140);
  }

  if (save) queuePersist();
}

function syncControls() {
  if ($("#zoomRange")) $("#zoomRange").value = state.view.zoom;
}

function clientToMap(clientX, clientY) {
  const rect = els.stage.getBoundingClientRect();
  const x = clamp(((clientX - rect.left) / rect.width) * 1000, 0, 1000);
  const y = clamp(((clientY - rect.top) / rect.height) * 1003, 0, 1003);
  return { x, y };
}

function formatCoord(point) {
  const gx = Math.round((point.y / 1003 * 1116 - 607) * 1000);
  const gy = Math.round((point.x / 1000 * 1112 - 505) * 1000);
  return `${gx.toLocaleString()}, ${gy.toLocaleString()}, 0`;
}

function gameToMap(gx, gy, clampToBounds = true) {
  const isLatLong = Math.abs(gx) < 2500 && Math.abs(gy) < 2500;
  const vX = isLatLong ? gx : gx / 1000;
  const vY = isLatLong ? gy : gy / 1000;
  const rawX = isLatLong ? gx * 1000 : gx;
  const rawY = isLatLong ? gy * 1000 : gy;
  const mapX = (vY + 505) / 1112 * 1000;
  const mapY = (vX + 607) / 1116 * 1003;

  // Section
  return {
    x: clampToBounds ? clamp(mapX, 0, 1000) : mapX,
    y: clampToBounds ? clamp(mapY, 0, 1003) : mapY,
    code: `${Math.round(rawX).toLocaleString()}, ${Math.round(rawY).toLocaleString()}`
  };
}

function nearestGrid(point) {
  const col = String.fromCharCode(65 + clamp(Math.floor(point.x / (1000 / 20)), 0, 19));
  const row = clamp(Math.floor(point.y / (1003 / 20)) + 1, 1, 20);
  return `${col}${row}`;
}

function gridXName(x, spacing) {
  const col = String.fromCharCode(65 + clamp(Math.floor(x / (1000 / 20)), 0, 19));
  return col;
}


function gridYName(y, spacing) {
  return String(clamp(Math.floor(y / (1003 / 20)) + 1, 1, 20));
}

function latestHistoryId() {
  return state.history[0]?.id;
}

function appendLatestFootstepRing(point, color, marker = markerSizeSettings(), hasIcon = false) {
  const min = hasIcon ? marker.iconRingMin : marker.pulseMin;
  const max = hasIcon ? marker.iconRingMax : marker.pulseMax;
  const ring = svg("circle", {
    cx: point.x,
    cy: point.y,
    r: min,
    class: "latest-footstep-ring",
    style: `stroke: ${color}; stroke-width: ${1 * marker.scale}`
  });
  if (isMobileViewport()) {
    ring.setAttribute("r", max);
    ring.setAttribute("opacity", "0.7");
  } else {
    ring.innerHTML = `<animate attributeName="r" values="${min};${max};${min}" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.95;0;0.95" dur="1.4s" repeatCount="indefinite"/>`;
  }
  els.footstepLayer.append(ring);
}

function appendFootstepIcon(point, color, marker, iconSrc, className = "", opacity = 0.95) {
  const size = marker.iconSize;
  const group = svg("g", {
    class: `footstep-marker ${className}`.trim(),
    opacity: opacity.toFixed(2),
    style: `color: ${color}`
  });
  group.append(svg("circle", {
    cx: point.x,
    cy: point.y,
    r: marker.iconBgRadius,
    class: "footstep-marker-bg"
  }));
  group.append(svg("image", {
    href: iconSrc,
    x: point.x - size / 2,
    y: point.y - size / 2,
    width: size,
    height: size,
    class: "footstep-marker-icon",
    preserveAspectRatio: "xMidYMid meet"
  }));
  els.footstepLayer.append(group);
}

function currentUserColor() {
  if (typeof currentUserDisplayColor === "function") {
    return currentUserDisplayColor();
  }
  const id = (typeof chat !== "undefined" && chat.user?.steam_id) || readLocalUserId();
  return userColor(id);
}

function currentUserMarkerIcon() {
  if (typeof getCurrentMarkerIconSrc === "function") {
    return getCurrentMarkerIconSrc();
  }
  return "";
}

function memberMarkerIcon(member) {
  if (typeof markerIconSrc === "function") {
    return markerIconSrc(member?.marker_icon);
  }
  return "";
}

function readLocalUserId() {
  try {
    return localStorage.getItem("anonId") || "local-user";
  } catch {
    return "local-user";
  }
}

function userColor(str) {
  if (typeof stringToColor === "function") return stringToColor(str);
  if (!str) return "#ffffff";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 65%)`;
}

function baseMapCssWidth() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 1021;
  return Math.min(MAP_BASE_MAX_WIDTH, viewportHeight * MAP_BASE_VIEWPORT_HEIGHT_RATIO);
}

function baseMapCssHeight() {
  return baseMapCssWidth() * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH);
}

function baseStageWidth() {
  return baseMapCssWidth();
}

function baseStageHeight() {
  return baseMapCssHeight();
}

async function copyViewLink() {
  const payload = new URLSearchParams({
    x: Math.round(state.view.x),
    y: Math.round(state.view.y),
    z: state.view.zoom.toFixed(2),
    r: Math.round(state.view.rotate),
    l: state.view.level
  });
  addRoomShareParams(payload);
  const text = `${shareBaseUrl()}#${payload.toString()}`;
  try {
    await navigator.clipboard.writeText(text);
    els.hoverCoord.textContent = payload.has("room") ? "Room invite link copied" : "View link copied";
  } catch {
    els.hoverCoord.textContent = text;
  }
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function svg(name, attrs = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  if (text) node.textContent = text;
  return node;
}

function savePreferences() {
  const startupOff = new Set(["toggleHeatmap", "toggleHerbs", "toggleEarth"]);
  const prefs = {};
  $$(".panel input[type='checkbox']").forEach(cb => {
    if (startupOff.has(cb.id)) return;
    if (cb.id) {
      prefs[cb.id] = cb.checked;
    }
  });
  writeJson('isleMapPrefs', prefs);
}

function queueOverlayPreferenceSave() {
  if (_overlayPrefsSaveTimer) clearTimeout(_overlayPrefsSaveTimer);
  _overlayPrefsSaveTimer = setTimeout(() => {
    _overlayPrefsSaveTimer = null;
    savePreferences();
  }, 200);
}

function loadPreferences() {
  loadMapSizePreference();
  const startupOff = new Set(["toggleHeatmap", "toggleHerbs", "toggleEarth"]);
  const prefs = readJson('isleMapPrefs', null);
  if (prefs) {
    $$(".panel input[type='checkbox']").forEach(cb => {
      if (startupOff.has(cb.id)) return;
      if (cb.id && prefs[cb.id] !== undefined) {
        cb.checked = prefs[cb.id];
        if (cb.dataset.overlay) {
          const subId = "sub" + cb.dataset.overlay.charAt(0).toUpperCase() + cb.dataset.overlay.slice(1);
          const subList = document.getElementById(subId);
          if (subList) subList.classList.toggle("is-open", cb.checked);
        }
      }
    });
  }
  if (!localStorage.getItem(WATER_OVERLAY_PREF_RESET_KEY)) {
    const waterControl = document.getElementById("toggleWater");
    if (waterControl) waterControl.checked = false;
    if (prefs) {
      prefs.toggleWater = false;
      writeJson("isleMapPrefs", prefs);
    }
    localStorage.setItem(WATER_OVERLAY_PREF_RESET_KEY, "1");
  }
  startupOff.forEach(id => {
    const control = document.getElementById(id);
    if (control) control.checked = false;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

boot();




