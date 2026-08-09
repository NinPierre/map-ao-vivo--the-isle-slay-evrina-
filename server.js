import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const envPath = process.env.ENV_PATH
  ? path.resolve(process.env.ENV_PATH)
  : path.join(__dirname, '.env');

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(envPath);

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CONFIG = {
  webPort: toNumber(process.env.PORT, 3001),
  rconHost: process.env.RCON_HOST || '127.0.0.1',
  rconPort: toNumber(process.env.RCON_PORT, 5555),
  rconPassword: process.env.RCON_PASSWORD || '',
  connectTimeoutMs: toNumber(process.env.RCON_CONNECT_TIMEOUT_MS, 15000),
  responseTimeoutMs: toNumber(process.env.RCON_RESPONSE_TIMEOUT_MS, 15000),
  idleResponseMs: toNumber(process.env.RCON_IDLE_RESPONSE_MS, 180),
  cacheTtlMs: toNumber(process.env.RCON_CACHE_TTL_MS, 1500),
  mapMinCoord: toNumber(process.env.MAP_MIN_COORD, -320000),
  mapMaxCoord: toNumber(process.env.MAP_MAX_COORD, 320000)
};

const COMMANDS = {
  getServerDetails: 0x12,
  getPlayerList: 0x40,
  getPlayerData: 0x77
};

const stateCache = {
  timestamp: 0,
  value: null,
  inFlight: null
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sanitizeConfig() {
  return {
    webPort: CONFIG.webPort,
    rconHost: CONFIG.rconHost,
    rconPort: CONFIG.rconPort,
    connectTimeoutMs: CONFIG.connectTimeoutMs,
    responseTimeoutMs: CONFIG.responseTimeoutMs,
    idleResponseMs: CONFIG.idleResponseMs,
    cacheTtlMs: CONFIG.cacheTtlMs,
    mapMinCoord: CONFIG.mapMinCoord,
    mapMaxCoord: CONFIG.mapMaxCoord,
    rconConfigured: Boolean(CONFIG.rconPassword)
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMaybeJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parsePlayerData(raw) {
  const json = parseMaybeJson(raw);
  if (json) {
    const list = Array.isArray(json) ? json : json.players || json.data || [];
    return list
      .map((item) => {
        const location = item.location || item.Location || {};
        return {
          id: String(item.id ?? item.playerId ?? item.PlayerID ?? item.steamId ?? ''),
          name: String(item.name ?? item.Name ?? 'Unknown'),
          className: String(item.className ?? item.class ?? item.DinoClass ?? 'Unknown'),
          growth: parseNumericValue(item.growth ?? item.Growth ?? 0),
          health: parseNumericValue(item.health ?? item.Health ?? 0),
          stamina: parseNumericValue(item.stamina ?? item.Stamina ?? 0),
          hunger: parseNumericValue(item.hunger ?? item.Hunger ?? 0),
          thirst: parseNumericValue(item.thirst ?? item.Thirst ?? 0),
          x: parseNumericValue(location.x ?? location.X ?? item.x ?? item.X ?? 0),
          y: parseNumericValue(location.y ?? location.Y ?? item.y ?? item.Y ?? 0),
          z: parseNumericValue(location.z ?? location.Z ?? item.z ?? item.Z ?? 0)
        };
      })
      .filter((player) => player.id || player.name);
  }

  const lines = raw.replace(/\0/g, '').split(/\r?\n/);
  const players = [];
  const matcher =
    /Name:\s*(.*?)\s*,\s*PlayerID:\s*([^,]+)[\s\S]*?Location:\s*X=([-\.\d]+)\s*Y=([-\.\d]+)\s*Z=([-\.\d]+)[\s\S]*?Class:\s*([^,]+)[\s\S]*?Growth:\s*([-\.\d]+)[\s\S]*?Health:\s*([-\.\d]+)[\s\S]*?Stamina:\s*([-\.\d]+)[\s\S]*?Hunger:\s*([-\.\d]+)[\s\S]*?Thirst:\s*([-\.\d]+)/i;

  for (const line of lines) {
    const match = line.match(matcher);
    if (!match) continue;

    players.push({
      name: match[1].trim(),
      id: match[2].trim(),
      x: parseNumericValue(match[3]),
      y: parseNumericValue(match[4]),
      z: parseNumericValue(match[5]),
      className: match[6].trim(),
      growth: parseNumericValue(match[7]) * 100,
      health: parseNumericValue(match[8]) * 100,
      stamina: parseNumericValue(match[9]) * 100,
      hunger: parseNumericValue(match[10]) * 100,
      thirst: parseNumericValue(match[11]) * 100
    });
  }

  return players;
}

function parsePlayerList(rawResponse) {
  const raw = String(rawResponse || '').replace(/\r/g, '\n');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^playerlist$/i.test(line) &&
        !/^playerlistend$/i.test(line) &&
        !/^error/i.test(line)
    );

  const players = [];
  const seen = new Set();

  const addPlayer = (steamId, name) => {
    if (!steamId || seen.has(steamId)) return;
    seen.add(steamId);
    players.push({
      id: steamId,
      name: name || 'Desconhecido'
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const idTokens = current
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);

    if (idTokens.length === 0 || !idTokens.every((token) => /^\d{17}$/.test(token))) {
      continue;
    }

    const nextLine = lines[index + 1] || '';
    const nameTokens = nextLine
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);

    const useNames = nameTokens.length >= idTokens.length;
    for (let tokenIndex = 0; tokenIndex < idTokens.length; tokenIndex += 1) {
      addPlayer(idTokens[tokenIndex], useNames ? nameTokens[tokenIndex] : 'Desconhecido');
    }

    if (useNames) {
      index += 1;
    }
  }

  for (const line of lines) {
    const ids = line.match(/\b\d{17}\b/g);
    if (!ids) continue;

    if (ids.length > 1) {
      for (const steamId of ids) {
        addPlayer(steamId, 'Desconhecido');
      }
      continue;
    }

    const steamId = ids[0];
    const name = line
      .replace(steamId, '')
      .replace(/[|;,]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    addPlayer(steamId, name || 'Desconhecido');
  }

  return players;
}

function mergePlayerRecords(basePlayers, detailPlayers, previousPlayers = []) {
  const detailById = new Map(detailPlayers.map((player) => [player.id, player]));
  const previousById = new Map(previousPlayers.map((player) => [player.id, player]));

  const merged = basePlayers.map((basePlayer) => {
    const detail = detailById.get(basePlayer.id) || {};
    const previous = previousById.get(basePlayer.id) || {};
    const x = Number.isFinite(detail.x) ? detail.x : Number.isFinite(previous.x) ? previous.x : null;
    const y = Number.isFinite(detail.y) ? detail.y : Number.isFinite(previous.y) ? previous.y : null;
    const z = Number.isFinite(detail.z) ? detail.z : Number.isFinite(previous.z) ? previous.z : null;

    return {
      id: basePlayer.id,
      name: basePlayer.name || detail.name || previous.name || 'Unknown',
      className: detail.className || previous.className || 'Unknown',
      growth: clamp(Number.isFinite(detail.growth) ? detail.growth : previous.growth || 0, 0, 100),
      health: clamp(Number.isFinite(detail.health) ? detail.health : previous.health || 0, 0, 100),
      stamina: clamp(Number.isFinite(detail.stamina) ? detail.stamina : previous.stamina || 0, 0, 100),
      hunger: clamp(Number.isFinite(detail.hunger) ? detail.hunger : previous.hunger || 0, 0, 100),
      thirst: clamp(Number.isFinite(detail.thirst) ? detail.thirst : previous.thirst || 0, 0, 100),
      x,
      y,
      z
    };
  });

  for (const detail of detailPlayers) {
    if (merged.some((player) => player.id === detail.id)) continue;
    merged.push({
      id: detail.id,
      name: detail.name || 'Unknown',
      className: detail.className || 'Unknown',
      growth: clamp(Number.isFinite(detail.growth) ? detail.growth : 0, 0, 100),
      health: clamp(Number.isFinite(detail.health) ? detail.health : 0, 0, 100),
      stamina: clamp(Number.isFinite(detail.stamina) ? detail.stamina : 0, 0, 100),
      hunger: clamp(Number.isFinite(detail.hunger) ? detail.hunger : 0, 0, 100),
      thirst: clamp(Number.isFinite(detail.thirst) ? detail.thirst : 0, 0, 100),
      x: Number.isFinite(detail.x) ? detail.x : null,
      y: Number.isFinite(detail.y) ? detail.y : null,
      z: Number.isFinite(detail.z) ? detail.z : null
    });
  }

  return merged;
}

function parseServerDetails(raw) {
  const json = parseMaybeJson(raw);
  if (json) return json;
  const lines = raw.replace(/\0/g, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

class EvrimaRconClient {
  constructor({ host, port, password, connectTimeoutMs, responseTimeoutMs, idleResponseMs }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.connectTimeoutMs = connectTimeoutMs;
    this.responseTimeoutMs = responseTimeoutMs;
    this.idleResponseMs = idleResponseMs;
  }

  async request(opcode, args = []) {
    const socket = new net.Socket();
    socket.setNoDelay(true);

    const connect = () =>
      new Promise((resolve, reject) => {
        const onError = (err) => {
          cleanup();
          reject(err);
        };
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          socket.off('error', onError);
          socket.off('connect', onConnect);
        };

        socket.once('error', onError);
        socket.once('connect', onConnect);
        socket.connect(this.port, this.host);
        socket.setTimeout(this.connectTimeoutMs, () => {
          cleanup();
          reject(new Error(`RCON connect timeout after ${this.connectTimeoutMs}ms`));
        });
      });

    const readResponse = () =>
      new Promise((resolve, reject) => {
        const chunks = [];
        let finished = false;
        let idleTimer = null;

        const cleanup = () => {
          socket.off('data', onData);
          socket.off('error', onError);
          socket.off('close', onClose);
          socket.off('timeout', onTimeout);
          if (idleTimer) clearTimeout(idleTimer);
        };

        const finish = () => {
          if (finished) return;
          finished = true;
          cleanup();
          const payload = Buffer.concat(chunks);
          const normalized = payload.length > 0 && payload[0] === 0x03 ? payload.subarray(1) : payload;
          resolve(normalized.toString('utf8').replace(/\0/g, '').trim());
        };

        const onError = (err) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(err);
        };

        const onClose = () => {
          if (!finished) finish();
        };

        const onTimeout = () => {
          if (!finished) {
            finished = true;
            cleanup();
            reject(new Error(`RCON response timeout after ${this.responseTimeoutMs}ms`));
          }
        };

        const onData = (chunk) => {
          chunks.push(chunk);
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, this.idleResponseMs);
        };

        socket.on('data', onData);
        socket.on('error', onError);
        socket.on('close', onClose);
        socket.on('timeout', onTimeout);
        socket.setTimeout(this.responseTimeoutMs);
      });

    try {
      await connect();

      socket.write(Buffer.concat([Buffer.from([0x01]), Buffer.from(this.password, 'utf8'), Buffer.from([0x00])]));
      const authReply = await readResponse();
      if (!/Password Accepted/i.test(authReply)) {
        throw new Error(authReply || 'RCON authentication failed');
      }

      const commandPayload = args.length ? args.join(',') : '';
      socket.write(Buffer.concat([
        Buffer.from([0x02, opcode]),
        Buffer.from(commandPayload, 'utf8'),
        Buffer.from([0x00])
      ]));

      return await readResponse();
    } finally {
      socket.destroy();
    }
  }
}

async function fetchState() {
  if (stateCache.inFlight) {
    return stateCache.inFlight;
  }

  const freshEnough = stateCache.value && Date.now() - stateCache.timestamp < CONFIG.cacheTtlMs;
  if (freshEnough) return stateCache.value;

  stateCache.inFlight = (async () => {
    const client = new EvrimaRconClient({
      host: CONFIG.rconHost,
      port: CONFIG.rconPort,
      password: CONFIG.rconPassword,
      connectTimeoutMs: CONFIG.connectTimeoutMs,
      responseTimeoutMs: CONFIG.responseTimeoutMs,
      idleResponseMs: CONFIG.idleResponseMs
    });

    try {
      const previousPlayers = Array.isArray(stateCache.value?.players) ? stateCache.value.players : [];
      const issues = [];

      const playerListRaw = await client.request(COMMANDS.getPlayerList);
      const serverRaw = await client.request(COMMANDS.getServerDetails).catch((error) => {
        issues.push(`serverdetails: ${error instanceof Error ? error.message : String(error)}`);
        return '';
      });
      const playerRaw = await client.request(COMMANDS.getPlayerData).catch((error) => {
        issues.push(`getplayerdata: ${error instanceof Error ? error.message : String(error)}`);
        return '';
      });

      const playerList = parsePlayerList(playerListRaw);
      const detailedPlayers = parsePlayerData(playerRaw);
      const players = mergePlayerRecords(playerList, detailedPlayers, previousPlayers).map((player) => ({
        ...player,
        x: Number.isFinite(player.x) ? player.x : null,
        y: Number.isFinite(player.y) ? player.y : null,
        z: Number.isFinite(player.z) ? player.z : null
      }));

      const payload = {
        ok: true,
        updatedAt: new Date().toISOString(),
        players,
        playerCount: players.length,
        server: parseServerDetails(serverRaw),
        warning: issues.length ? issues.join(' | ') : '',
        raw: {
          playerListPreview: playerListRaw.slice(0, 1200),
          playerDataPreview: playerRaw.slice(0, 2500),
          serverDetailsPreview: serverRaw.slice(0, 1000)
        }
      };

      stateCache.value = payload;
      stateCache.timestamp = Date.now();
      return payload;
    } catch (error) {
      const payload = {
        ok: false,
        updatedAt: new Date().toISOString(),
        players: [],
        playerCount: 0,
        server: null,
        error: error instanceof Error ? error.message : String(error)
      };
      stateCache.value = payload;
      stateCache.timestamp = Date.now();
      return payload;
    } finally {
      stateCache.inFlight = null;
    }
  })();

  return stateCache.inFlight;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' || !path.extname(pathname) ? '/index.html' : pathname;
  const relativePath = requestedPath.replace(/^\/+/, '');
  const resolved = path.resolve(publicDir, relativePath);
  if (!resolved.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(resolved);
    res.writeHead(200, {
      'Content-Type': contentType(resolved),
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function createHttpServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (pathname === '/api/config') {
      sendJson(res, 200, sanitizeConfig());
      return;
    }

    if (pathname === '/api/state') {
      const state = await fetchState();
      sendJson(res, state.ok ? 200 : 503, state);
      return;
    }

    await serveStatic(req, res, pathname);
  });
}

export function startServer(port = CONFIG.webPort) {
  const server = createHttpServer();

  return new Promise((resolve, reject) => {
    const tryListen = (currentPort, attempt) => {
      const onError = (error) => {
        if (error.code === 'EADDRINUSE' && attempt < 10) {
          const nextPort = currentPort + 1;
          console.warn(`Port ${currentPort} is busy; trying ${nextPort} instead.`);
          server.removeListener('error', onError);
          tryListen(nextPort, attempt + 1);
          return;
        }

        reject(error);
      };

      server.once('error', onError);
      server.listen(currentPort, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          CONFIG.webPort = address.port;
        }
        console.log(`The Isle live map running on http://localhost:${CONFIG.webPort}`);
        console.log(`RCON target: ${CONFIG.rconHost}:${CONFIG.rconPort}`);
        resolve(server);
      });
    };

    tryListen(port, 0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
