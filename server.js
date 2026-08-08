import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const envPath = path.join(__dirname, '.env');

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

const CONFIG = {
  webPort: Number(process.env.PORT || 3001),
  rconHost: process.env.RCON_HOST || '127.0.0.1',
  rconPort: Number(process.env.RCON_PORT || 5555),
  rconPassword: process.env.RCON_PASSWORD || '',
  connectTimeoutMs: Number(process.env.RCON_CONNECT_TIMEOUT_MS || 15000),
  responseTimeoutMs: Number(process.env.RCON_RESPONSE_TIMEOUT_MS || 15000),
  idleResponseMs: Number(process.env.RCON_IDLE_RESPONSE_MS || 180),
  cacheTtlMs: Number(process.env.RCON_CACHE_TTL_MS || 1500),
  mapMinCoord: Number(process.env.MAP_MIN_COORD || -320000),
  mapMaxCoord: Number(process.env.MAP_MAX_COORD || 320000)
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
          growth: Number(item.growth ?? item.Growth ?? 0),
          health: Number(item.health ?? item.Health ?? 0),
          stamina: Number(item.stamina ?? item.Stamina ?? 0),
          hunger: Number(item.hunger ?? item.Hunger ?? 0),
          thirst: Number(item.thirst ?? item.Thirst ?? 0),
          x: Number(location.x ?? location.X ?? item.x ?? item.X ?? 0),
          y: Number(location.y ?? location.Y ?? item.y ?? item.Y ?? 0),
          z: Number(location.z ?? location.Z ?? item.z ?? item.Z ?? 0)
        };
      })
      .filter((player) => player.id || player.name);
  }

  const lines = raw.replace(/\0/g, '').split(/\r?\n/);
  const players = [];
  const matcher =
    /Name:\s*(.*?)\s*,\s*PlayerID:\s*([^,]+),\s*Location:\s*X=([-.\d]+)\s*Y=([-.\d]+)\s*Z=([-.\d]+),\s*Class:\s*([^,]+),\s*Growth:\s*([-.\d]+),\s*Health:\s*([-.\d]+),\s*Stamina:\s*([-.\d]+),\s*Hunger:\s*([-.\d]+),\s*Thirst:\s*([-.\d]+)/;

  for (const line of lines) {
    const match = line.match(matcher);
    if (!match) continue;

    players.push({
      name: match[1].trim(),
      id: match[2].trim(),
      x: Number(match[3]),
      y: Number(match[4]),
      z: Number(match[5]),
      className: match[6].trim(),
      growth: Number(match[7]) * 100,
      health: Number(match[8]) * 100,
      stamina: Number(match[9]) * 100,
      hunger: Number(match[10]) * 100,
      thirst: Number(match[11]) * 100
    });
  }

  return players;
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
  if (!CONFIG.rconPassword) {
    return {
      ok: false,
      error: 'RCON_PASSWORD ausente',
      updatedAt: new Date().toISOString(),
      players: [],
      server: null
    };
  }

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
      const [serverRaw, playerRaw] = await Promise.all([
        client.request(COMMANDS.getServerDetails).catch(() => ''),
        client.request(COMMANDS.getPlayerData)
      ]);

      const players = parsePlayerData(playerRaw).map((player) => ({
        ...player,
        x: Number.isFinite(player.x) ? player.x : 0,
        y: Number.isFinite(player.y) ? player.y : 0,
        z: Number.isFinite(player.z) ? player.z : 0,
        growth: clamp(Number.isFinite(player.growth) ? player.growth : 0, 0, 100),
        health: clamp(Number.isFinite(player.health) ? player.health : 0, 0, 100),
        stamina: clamp(Number.isFinite(player.stamina) ? player.stamina : 0, 0, 100),
        hunger: clamp(Number.isFinite(player.hunger) ? player.hunger : 0, 0, 100),
        thirst: clamp(Number.isFinite(player.thirst) ? player.thirst : 0, 0, 100)
      }));

      const payload = {
        ok: true,
        updatedAt: new Date().toISOString(),
        players,
        playerCount: players.length,
        server: parseServerDetails(serverRaw),
        raw: {
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

const server = http.createServer(async (req, res) => {
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

server.listen(CONFIG.webPort, () => {
  console.log(`The Isle live map running on http://localhost:${CONFIG.webPort}`);
  console.log(`RCON target: ${CONFIG.rconHost}:${CONFIG.rconPort}`);
});
