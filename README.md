# The Isle Live Map

Painel web para **The Isle: Evrima** com leitura ao vivo via RCON.

## O que faz

- Conecta no servidor remoto com `RCON_HOST`, `RCON_PORT` e `RCON_PASSWORD`
- Lê `getPlayerData` e desenha os jogadores no mapa
- Exibe nome, classe, growth, health e coordenadas
- Permite filtro por nome/classe/ID
- Permite colar uma coordenada manualmente para destacar o ponto no mapa

## Como rodar

1. Instale o Node.js 18+.
2. Copie `.env.example` para `.env` e ajuste os valores.
3. Inicie com `npm start`.
4. Abra `http://localhost:3001`.

### Exemplo `.env`

```env
PORT=3001
RCON_HOST=127.0.0.1
RCON_PORT=5555
RCON_PASSWORD=genomaslot
RCON_CONNECT_TIMEOUT_MS=15000
RCON_RESPONSE_TIMEOUT_MS=15000
RCON_IDLE_RESPONSE_MS=180
RCON_CACHE_TTL_MS=1500
MAP_MIN_COORD=-320000
MAP_MAX_COORD=320000
```

## Variáveis

- `PORT`: porta da interface web, padrão `3001`
- `RCON_HOST`: host do RCON
- `RCON_PORT`: porta do RCON
- `RCON_PASSWORD`: senha do RCON
- `RCON_CONNECT_TIMEOUT_MS`: timeout de conexão, padrão `15000`
- `RCON_RESPONSE_TIMEOUT_MS`: timeout de resposta, padrão `15000`
- `RCON_IDLE_RESPONSE_MS`: tempo de silêncio para fechar a leitura, padrão `180`
- `RCON_CACHE_TTL_MS`: cache curto para evitar excesso de requisições, padrão `1500`
- `MAP_MIN_COORD`: limite inferior da grade do mapa, padrão `-320000`
- `MAP_MAX_COORD`: limite superior da grade do mapa, padrão `320000`

## Observação importante

O projeto usa os dados de coordenada que o RCON do Evrima expõe em `getPlayerData`. Isso torna o mapa ao vivo viável sem mexer no cliente do jogo.
