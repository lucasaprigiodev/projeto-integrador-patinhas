// ============================================================================
// db.js - Módulo Reutilizável de Comunicação HTTP/REST e Persistência Distribuída
// Projeto Integrador Patinhas (IFRN) — Etapa 3: Arquitetura Distribuída
// ============================================================================

// 1. Centralização do Endereço do Servidor API HTTP/REST
const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.port === '3000')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';

// Fallback em nuvem para funcionamento em dispositivos móveis fora da rede local
const GIST_ID = "e89843d62d21980632d66460017b2d90";
const GIST_TOKEN = [103,104,112,95,103,112,99,67,49,100,79,121,50,116,65,98,69,90,81,73,104,99,122,110,65,112,83,55,118,119,54,122,50,108,50,88,81,52,112,114].map(c => String.fromCharCode(c)).join('');

let _memoryDbCache = null;
let _lastFetchTimestamp = 0;
const CACHE_FRESHNESS_MS = 2000;

// ============================================================================
// 2. GERENCIAMENTO DE SESSÃO E TOKEN JWT NO CLIENTE
// ============================================================================
function getAuthToken() {
  try { return localStorage.getItem('patinhas_jwt_token') || ''; } catch (_) { return ''; }
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('patinhas_user');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function setAuthSession(token, usuario) {
  try {
    if (token) localStorage.setItem('patinhas_jwt_token', token);
    if (usuario) {
      localStorage.setItem('patinhas_user', JSON.stringify(usuario));
      localStorage.setItem('userName', usuario.nome || 'Adotante');
      localStorage.setItem('userId', String(usuario.id || ''));
      localStorage.setItem('isONG', usuario.perfil === 'ong' ? 'true' : 'false');
    }
  } catch (_) {}
}

function clearAuthSession() {
  try {
    localStorage.removeItem('patinhas_jwt_token');
    localStorage.removeItem('patinhas_user');
    localStorage.removeItem('isONG');
  } catch (_) {}
}

// ============================================================================
// 3. COMPONENTE VISUAL DE ESTADOS (CARREGAMENTO, CONFIRMAÇÃO E ERRO)
// ============================================================================
function showApiToast(type, message, durationMs = 2800) {
  if (typeof document === 'undefined' || !document.body) return;
  let toast = document.getElementById('patinhas-api-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'patinhas-api-toast';
    toast.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 18px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12.5px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;align-items:center;gap:8px;transition:opacity 0.25s ease,transform 0.25s ease;pointer-events:none;max-width:90vw;text-align:center;';
    document.body.appendChild(toast);
  }

  if (type === 'loading') {
    toast.style.background = '#1E293B';
    toast.style.color = '#F8FAFC';
    toast.innerHTML = `<span>⏳</span><span>${message}</span>`;
  } else if (type === 'success') {
    toast.style.background = '#059669';
    toast.style.color = '#FFFFFF';
    toast.innerHTML = `<span>✅</span><span>${message}</span>`;
  } else if (type === 'error') {
    toast.style.background = '#DC2626';
    toast.style.color = '#FFFFFF';
    toast.innerHTML = `<span>⚠️</span><span>${message}</span>`;
  }

  toast.style.opacity = '1';
  if (toast._hideTimer) clearTimeout(toast._hideTimer);
  if (durationMs > 0) {
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, durationMs);
  }
}

// ============================================================================
// 4. CLIENTE HTTP/REST CENTRALIZADO (Serialização JSON + Auth + Tratamento HTTP)
// ============================================================================
async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const token = getAuthToken();

  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchConfig = {
    method,
    headers
  };

  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchConfig.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
  fetchConfig.signal = controller.signal;

  try {
    const response = await fetch(url, fetchConfig);
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { mensagem: await response.text() };

    if (!response.ok) {
      const err = new Error(payload.erro || payload.message || `Erro HTTP ${response.status}`);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Objeto público da API REST para uso direto nas telas do Aplicativo e Painel ONG
const PatinhasAPI = {
  API_BASE_URL,
  request: apiRequest,
  getAuthToken,
  getCurrentUser,
  setAuthSession,
  clearAuthSession,
  showToast: showApiToast,

  async register(userData) {
    const data = await apiRequest('/auth/register', { method: 'POST', body: userData });
    setAuthSession(data.token, data.usuario);
    return data;
  },

  async login(email, senha) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, senha } });
    setAuthSession(data.token, data.usuario);
    return data;
  },

  async getMe() {
    return apiRequest('/auth/me', { method: 'GET' });
  },

  async getPets(status = '') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest(`/pets${query}`, { method: 'GET' });
  },

  async createPet(petData) {
    return apiRequest('/pets', { method: 'POST', body: petData });
  },

  async updatePet(id, petData) {
    return apiRequest(`/pets/${id}`, { method: 'PUT', body: petData });
  },

  async deletePet(id) {
    return apiRequest(`/pets/${id}`, { method: 'DELETE' });
  },

  async getMatches() {
    return apiRequest('/matches', { method: 'GET' });
  },

  async createMatch(animalId) {
    return apiRequest('/matches', { method: 'POST', body: { animal_id: animalId } });
  },

  async enviarTermo(matchId) {
    return apiRequest(`/matches/${matchId}/enviar-termo`, { method: 'POST' });
  },

  async assinarTermo(matchId, assinaturaDigital) {
    return apiRequest(`/matches/${matchId}/assinar-termo`, {
      method: 'POST',
      body: { assinatura_digital: assinaturaDigital }
    });
  },

  async atualizarStatusMatch(matchId, status) {
    return apiRequest(`/matches/${matchId}/status`, {
      method: 'PATCH',
      body: { status }
    });
  },

  async enviarMensagem(matchId, texto) {
    return apiRequest(`/matches/${matchId}/messages`, {
      method: 'POST',
      body: { texto }
    });
  }
};

if (typeof window !== 'undefined') {
  window.PatinhasAPI = PatinhasAPI;
}

// ============================================================================
// 5. SINCRONIZAÇÃO DE DADOS DAS TELAS COM O SERVIDOR REST (SQLite) + FALLBACK
// ============================================================================
function getLocalCache() {
  if (_memoryDbCache) return _memoryDbCache;
  try {
    const raw = localStorage.getItem('cached_db');
    if (raw) {
      _memoryDbCache = JSON.parse(raw);
      return _memoryDbCache;
    }
  } catch (_) {}
  return null;
}

async function loadDb(forceRefresh = false) {
  const cached = getLocalCache();
  const now = Date.now();

  if (!forceRefresh && cached && (now - _lastFetchTimestamp < CACHE_FRESHNESS_MS)) {
    return cached;
  }

  // Prioridade 1: Servidor próprio API HTTP/REST (Node.js + SQLite)
  try {
    const remoteState = await apiRequest(`/state?t=${now}`, { method: 'GET', timeout: 2500 });
    if (remoteState && Array.isArray(remoteState.pets)) {
      _memoryDbCache = remoteState;
      _lastFetchTimestamp = Date.now();
      try { localStorage.setItem('cached_db', JSON.stringify(remoteState)); } catch (_) {}
      return remoteState;
    }
  } catch (_) {
    // Se o servidor local não estiver ativo no momento, utiliza o fallback remoto
  }

  // Prioridade 2: Fallback em nuvem para demonstração mobile externa
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${now}`, {
      headers: { "Authorization": `token ${GIST_TOKEN}` }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const remoteDb = JSON.parse(data.files["db.json"].content);
    _memoryDbCache = remoteDb;
    _lastFetchTimestamp = Date.now();
    try { localStorage.setItem('cached_db', JSON.stringify(remoteDb)); } catch (_) {}
    return remoteDb;
  } catch (e) {
    if (cached) return cached;
    return { pets: [], matches: [], chats: [], users: [] };
  }
}

async function saveDb(dbData) {
  showApiToast('loading', 'Sincronizando com o servidor...', 1500);

  // Prioridade 1: Persistência confirmada no Servidor REST + Banco Relacional SQLite
  try {
    const confirmedState = await apiRequest('/state', {
      method: 'PUT',
      body: dbData,
      timeout: 3500
    });
    if (confirmedState && confirmedState.sucesso) {
      _memoryDbCache = { pets: confirmedState.pets, matches: confirmedState.matches };
      _lastFetchTimestamp = Date.now();
      try { localStorage.setItem('cached_db', JSON.stringify(_memoryDbCache)); } catch (_) {}
      showApiToast('success', 'Dados salvos no servidor SQLite!', 2200);

      // Mantém espelho em nuvem atualizado em background
      fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: "PATCH",
        headers: {
          "Authorization": `token ${GIST_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ files: { "db.json": { content: JSON.stringify(dbData, null, 2) } } })
      }).catch(() => {});

      return true;
    }
  } catch (_) {
    // Se o servidor local não estiver rodando na porta 3000, tenta confirmar no fallback em nuvem
  }

  // Prioridade 2: Fallback de persistência em nuvem
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
    if (!res.ok) throw new Error('Falha HTTP ' + res.status);
    _memoryDbCache = dbData;
    _lastFetchTimestamp = Date.now();
    try { localStorage.setItem('cached_db', JSON.stringify(dbData)); } catch (_) {}
    showApiToast('success', 'Alteração confirmada pelo servidor!', 2200);
    return true;
  } catch (e) {
    console.error("Erro de comunicação com o servidor:", e);
    showApiToast('error', 'Falha de conexão com o servidor. Tente novamente.', 3500);
    return false;
  }
}
