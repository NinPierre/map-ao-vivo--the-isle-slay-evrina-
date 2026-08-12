import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
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

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(item, 'true');
      continue;
    }
    args.set(item, next);
    index += 1;
  }
  return args;
}

function getArg(args, name, fallback = '') {
  return args.has(name) ? args.get(name) : fallback;
}

function boolArg(value) {
  return ['1', 'true', 'yes', 'on', 'sim'].includes(String(value || '').trim().toLowerCase());
}

function isPrivateIpv4(value) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || ''))) return false;
  const parts = String(value)
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function inferSubnet(host) {
  if (!isPrivateIpv4(host)) return '172.18.0';
  const parts = String(host).split('.');
  return parts.slice(0, 3).join('.');
}

function parseSubnetList(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(item)) return false;
      return item.split('.').every((part) => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 255;
      });
    });
}

function collectPrivateSubnets() {
  const subnets = new Set();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      const parts = String(entry.address).split('.');
      if (parts.length === 4) subnets.add(parts.slice(0, 3).join('.'));
    }
  }
  return subnets;
}

function resolveSubnets(envHost, extra) {
  const subnets = new Set();
  for (const subnet of parseSubnetList(extra)) subnets.add(subnet);
  for (const subnet of collectPrivateSubnets()) subnets.add(subnet);
  if (envHost && isPrivateIpv4(envHost)) subnets.add(inferSubnet(envHost));
  if (subnets.size === 0) subnets.add('172.18.0');
  return Array.from(subnets);
}

function waitForSocketConnect(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('timeout_connect'));
    }, timeoutMs);

    const onConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

function decodeRconResponse(buffer) {
  let payload = Buffer.from(buffer);
  if (payload.length > 0 && payload[0] === 0x03) payload = payload.subarray(1);
  return payload.toString('utf8').replace(/\0/g, '').trim();
}

function buildAuthPacket(password) {
  return Buffer.concat([
    Buffer.from([0x01]),
    Buffer.from(String(password || ''), 'utf8'),
    Buffer.from([0x00])
  ]);
}

function buildCommandPacket(commandByte, payload = '') {
  return Buffer.concat([
    Buffer.from([0x02, commandByte]),
    Buffer.from(String(payload || ''), 'utf8'),
    Buffer.from([0x00])
  ]);
}

function looksLikeAuthFailure(text) {
  return /unauthenticated|password mismatch|not authenticated|invalid password/i.test(
    String(text || '')
  );
}

function safeCloseSocket(socket) {
  if (!socket || socket.destroyed) return;
  socket.end();
  setTimeout(() => {
    if (!socket.destroyed) socket.destroy();
  }, 200);
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
      steam_id: steamId,
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

function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMaybeJson(raw) {
  const trimmed = String(raw || '').trim();
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

  const lines = String(raw || '')
    .replace(/\0/g, '')
    .split(/\r?\n/);
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

function formatPlayerLine(player) {
  const name = player.name || 'Unknown';
  const id = player.id || 'n/a';
  const coords =
    Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z)
      ? `x=${player.x} y=${player.y} z=${player.z}`
      : 'coords=unavailable';
  const className = player.className || 'Unknown';
  return `${name} | ${id} | ${className} | ${coords}`;
}

function filterPlayers(players, { steamId, name }) {
  const steamNeedle = String(steamId || '').trim();
  const nameNeedle = String(name || '').trim().toLowerCase();

  return players.filter((player) => {
    if (steamNeedle && String(player.id || '') !== steamNeedle) return false;
    if (nameNeedle && !String(player.name || '').toLowerCase().includes(nameNeedle)) return false;
    return true;
  });
}

const COMMANDS = {
  playerlist: 0x40,
  serverdetails: 0x12,
  getplayerdata: 0x77
};

class RconClient {
  constructor({ host, port, password, connectTimeoutMs, responseTimeoutMs, idleResponseMs }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.connectTimeoutMs = connectTimeoutMs;
    this.responseTimeoutMs = responseTimeoutMs;
    this.idleResponseMs = idleResponseMs;
  }

  async request(commandName, payload = '') {
    const commandByte = COMMANDS[String(commandName || '').trim().toLowerCase()];
    if (!commandByte) {
      throw new Error(`Comando desconhecido: ${commandName}`);
    }

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
          const payloadBuffer = Buffer.concat(chunks);
          resolve(decodeRconResponse(payloadBuffer));
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
        socket.setTimeout(this.responseTimeoutMs, onTimeout);
      });

    try {
      await connect();

      socket.write(buildAuthPacket(this.password));
      const authReply = await readResponse();
      if (looksLikeAuthFailure(authReply)) {
        throw new Error(authReply || 'RCON authentication failed');
      }

      socket.write(buildCommandPacket(commandByte, payload));
      return await readResponse();
    } finally {
      socket.destroy();
    }
  }
}

async function testTcp(host, port, timeoutMs) {
  const socket = net.createConnection({ host, port });
  socket.setNoDelay(true);
  try {
    await waitForSocketConnect(socket, timeoutMs);
    return true;
  } finally {
    safeCloseSocket(socket);
  }
}

async function runDirectTest(config) {
  console.log(`[INFO] Testando TCP ${config.host}:${config.port}`);
  await testTcp(config.host, config.port, config.connectTimeoutMs);
  console.log('[OK] TCP abriu.');

  const client = new RconClient(config);
  console.log('[INFO] Testando auth + playerlist...');
  const playerList = await client.request('playerlist');
  const players = parsePlayerList(playerList);
  console.log(`[OK] playerlist respondeu. Jogadores encontrados: ${players.length}`);
  console.log(`[INFO] playerlist preview: ${String(playerList || '').slice(0, 240) || '(vazio)'}`);

  for (const commandName of ['serverdetails', 'getplayerdata']) {
    try {
      const response = await client.request(commandName);
      console.log(`[OK] ${commandName} respondeu: ${String(response || '').slice(0, 240) || '(vazio)'}`);
    } catch (error) {
      console.log(`[WARN] ${commandName} falhou: ${error.message}`);
    }
  }
}

async function dumpPlayers(config, filters = {}) {
  const client = new RconClient(config);
  const response = await client.request('getplayerdata');
  const players = filterPlayers(parsePlayerData(response), filters);

  console.log(`[OK] getplayerdata respondeu. Jogadores encontrados: ${players.length}`);

  return players;
}

async function scanRcon(options) {
  const { subnets, start, end, port, timeoutMs, responseTimeoutMs, idleMs, password } = options;
  console.log(`[INFO] Scan RCON: subnets=${subnets.join(',')} range=${start}-${end} port=${port}`);

  for (const subnet of subnets) {
    for (let suffix = start; suffix <= end; suffix += 1) {
      const host = `${subnet}.${suffix}`;
      try {
        await testTcp(host, port, timeoutMs);
      } catch {
        continue;
      }

      console.log(`[INFO] TCP aberto em ${host}:${port}, testando playerlist...`);
      try {
        const client = new RconClient({
          host,
          port,
          password,
          connectTimeoutMs: timeoutMs,
          responseTimeoutMs,
          idleResponseMs: idleMs
        });
        const response = await client.request('playerlist');
        const players = parsePlayerList(response);
        console.log(`[OK] RCON OK em ${host}:${port} jogadores=${players.length}`);
        console.log(`[OK] Use este RCON_HOST: ${host}`);
        return host;
      } catch (error) {
        console.log(`[WARN] ${host}:${port} falhou no RCON: ${error.message}`);
      }
    }
  }

  console.log('[WARN] Scan finalizado sem sucesso.');
  return null;
}

async function main() {
  const envPath = path.join(__dirname, '.env');
  loadDotEnv(envPath);

  const args = parseArgs(process.argv.slice(2));
  const host = getArg(args, '--host', process.env.RCON_HOST || '127.0.0.1');
  const port = toNumber(getArg(args, '--port', process.env.RCON_PORT || 5555), 5555);
  const password = getArg(args, '--password', process.env.RCON_PASSWORD || '');
  const connectTimeoutMs = toNumber(
    getArg(args, '--connect-timeout', process.env.RCON_CONNECT_TIMEOUT_MS || 15000),
    15000
  );
  const responseTimeoutMs = toNumber(
    getArg(args, '--response-timeout', process.env.RCON_RESPONSE_TIMEOUT_MS || 15000),
    15000
  );
  const idleResponseMs = toNumber(
    getArg(args, '--idle-ms', process.env.RCON_IDLE_RESPONSE_MS || 180),
    180
  );
  const dumpPlayersFlag = boolArg(getArg(args, '--dump-players', 'false'));
  const steamIdFilter = getArg(args, '--steam-id', '');
  const nameFilter = getArg(args, '--name', '');
  const jsonOutput = boolArg(getArg(args, '--json', 'false'));

  console.log('[INFO] Diagnostico RCON iniciado.');
  console.log(`[INFO] host=${host} port=${port} password=${password ? 'ok' : 'vazio'}`);
  console.log(
    `[INFO] timeouts connect=${connectTimeoutMs} response=${responseTimeoutMs} idle=${idleResponseMs}`
  );

  try {
    await runDirectTest({
      host,
      port,
      password,
      connectTimeoutMs,
      responseTimeoutMs,
      idleResponseMs
    });

    if (dumpPlayersFlag) {
      const players = await dumpPlayers(
        {
          host,
          port,
          password,
          connectTimeoutMs,
          responseTimeoutMs,
          idleResponseMs
        },
        { steamId: steamIdFilter, name: nameFilter }
      );

      if (jsonOutput) {
        console.log(JSON.stringify(players, null, 2));
      } else {
        for (const player of players) {
          console.log(formatPlayerLine(player));
        }
      }
    }

    console.log('[OK] Diagnostico concluido.');
    return;
  } catch (error) {
    console.log(`[ERROR] Teste direto falhou: ${error.message}`);
  }

  const shouldScan = boolArg(getArg(args, '--scan', process.env.RCON_SCAN || 'false'));
  if (!shouldScan) {
    console.log(
      '[INFO] Rode novamente com --scan se quiser varrer a rede local e localizar outro host RCON.'
    );
    return;
  }

  const extraSubnets = getArg(args, '--subnets', process.env.RCON_DISCOVER_SUBNETS || '');
  const start = toNumber(getArg(args, '--start', process.env.RCON_DISCOVER_START || 1), 1);
  const end = toNumber(getArg(args, '--end', process.env.RCON_DISCOVER_END || 32), 32);

  await scanRcon({
    subnets: resolveSubnets(host, extraSubnets),
    start: Math.max(1, Math.min(254, start)),
    end: Math.max(1, Math.min(254, end)),
    port,
    timeoutMs: Math.max(250, Math.min(4000, connectTimeoutMs)),
    responseTimeoutMs: Math.max(250, Math.min(4000, responseTimeoutMs)),
    idleMs: Math.max(50, idleResponseMs),
    password
  });
}

main().catch((error) => {
  console.error(`[FATAL] ${error.stack || error.message || String(error)}`);
  process.exitCode = 1;
});
