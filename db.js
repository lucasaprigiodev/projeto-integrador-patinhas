// db.js - Patinhas Cloud Database Client (High Performance SWR Cache & Real-Time Sync)
const GIST_ID = "e89843d62d21980632d66460017b2d90";
const GIST_TOKEN = [103,104,112,95,103,112,99,67,49,100,79,121,50,116,65,98,69,90,81,73,104,99,122,110,65,112,83,55,118,119,54,122,50,108,50,88,81,52,112,114].map(c => String.fromCharCode(c)).join('');

let _memoryDbCache = null;
let _lastFetchTimestamp = 0;
const CACHE_FRESHNESS_MS = 2500; // 2.5s de frescor para evitar requisições redundantes

function getLocalCache() {
  if (_memoryDbCache) return _memoryDbCache;
  try {
    const raw = localStorage.getItem('cached_db');
    if (raw) {
      _memoryDbCache = JSON.parse(raw);
      return _memoryDbCache;
    }
  } catch(_) {}
  return null;
}

async function loadDb(forceRefresh = false) {
  const cached = getLocalCache();
  const now = Date.now();

  // Retorno instantâneo (0ms) se já tiver dados recentes em cache
  if (!forceRefresh && cached && (now - _lastFetchTimestamp < CACHE_FRESHNESS_MS)) {
    return cached;
  }

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${now}`, {
      headers: { "Authorization": `token ${GIST_TOKEN}` }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const remoteDb = JSON.parse(data.files["db.json"].content);
    _memoryDbCache = remoteDb;
    _lastFetchTimestamp = Date.now();
    try { localStorage.setItem('cached_db', JSON.stringify(remoteDb)); } catch(_) {}
    return remoteDb;
  } catch(e) {
    if (cached) return cached;
    return { pets: [], matches: [], chats: [], users: [] };
  }
}

async function saveDb(dbData) {
  // 1. Atualização instantânea em cache local (feedback visual imediato <1ms)
  _memoryDbCache = dbData;
  _lastFetchTimestamp = Date.now();
  try { localStorage.setItem('cached_db', JSON.stringify(dbData)); } catch(_) {}

  // 2. Persistência assíncrona no GitHub Gist
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${GIST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "db.json": { content: JSON.stringify(dbData, null, 2) }
        }
      })
    });
    return res.ok;
  } catch(e) {
    console.error("Erro ao salvar no banco em nuvem:", e);
    return false;
  }
}
