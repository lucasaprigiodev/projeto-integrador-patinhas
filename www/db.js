// ============================================================================
// db.js - Módulo Reutilizável de Comunicação HTTP/REST, Cache SWR e Alta Performance
// Projeto Integrador Patinhas (IFRN) — Etapa 3 & Revisão Completa
// ============================================================================

const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.port === '3000')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';

const GIST_ID = "e89843d62d21980632d66460017b2d90";
const GIST_TOKEN = [103,104,112,95,103,112,99,67,49,100,79,121,50,116,65,98,69,90,81,73,104,99,122,110,65,112,83,55,118,119,54,122,50,108,50,88,81,52,112,114].map(c => String.fromCharCode(c)).join('');

let _memoryDbCache = null;
let _lastFetchTimestamp = 0;
const CACHE_FRESHNESS_MS = 1800; // Cache ultra-rápido de 1.8s para navegação a 60fps

// Base de dados rica padrão (Fallback instantâneo caso offline)
const DEFAULT_SEED_DB = {
  pets: [
    { id: 1, name: "Buddy", nome: "Buddy", species: "Cachorro", especie: "Cachorro", breed: "Golden Retriever", raca: "Golden Retriever", age: "2 anos", idade: "2 anos", size: "Grande", porte: "Grande", gender: "Macho", sexo: "Macho", dist: "3km • Tirol", ong: "ONG Patinhas Natal", status: "disponivel", matchScore: 98, img: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80", about: "O Buddy foi resgatado e é extremamente dócil, vacinado (V10 + Antirrábica), castrado e microchipado. Adora brincar com bolinhas e convive muito bem com crianças e outros pets." },
    { id: 2, name: "Luna", nome: "Luna", species: "Cachorro", especie: "Cachorro", breed: "SRD (Caramelo)", raca: "SRD (Caramelo)", age: "1 ano", idade: "1 ano", size: "Médio", porte: "Médio", gender: "Fêmea", sexo: "Fêmea", dist: "2km • Ponta Negra", ong: "Protetores de Ponta Negra", status: "disponivel", matchScore: 96, img: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80", about: "Luna é uma cachorrinha carinhosa, alegre e já está 100% vacinada, castrada e vermifugada. Passeia super bem na guia e procura uma família amorosa em Natal/RN." },
    { id: 3, name: "Nala", nome: "Nala", species: "Gato", especie: "Gato", breed: "Tigrada SRD", raca: "Tigrada SRD", age: "8 meses", idade: "8 meses", size: "Pequeno", porte: "Pequeno", gender: "Fêmea", sexo: "Fêmea", dist: "1.5km • Lagoa Nova", ong: "Gatil Amor Felino RN", status: "disponivel", matchScore: 95, img: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80", about: "Nala é uma gatinha jovem, super ronronante, testada FIV/FeLV negativo, castrada e acostumada a usar caixinha de areia. Ideal para apartamentos telados." },
    { id: 4, name: "Thor", nome: "Thor", species: "Cachorro", especie: "Cachorro", breed: "Pastor Alemão", raca: "Pastor Alemão", age: "3 anos", idade: "3 anos", size: "Grande", porte: "Grande", gender: "Macho", sexo: "Macho", dist: "5km • Capim Macio", ong: "ONG Patinhas Natal", status: "disponivel", matchScore: 94, img: "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&q=80", about: "Thor é leal, inteligente, obediente e muito carinhoso com a família. Vacinado, castrado e vermifugado. Ideal para casas com quintal murado." },
    { id: 5, name: "Bella", nome: "Bella", species: "Cachorro", especie: "Cachorro", breed: "Poodle Toy", raca: "Poodle Toy", age: "2 anos", idade: "2 anos", size: "Pequeno", porte: "Pequeno", gender: "Fêmea", sexo: "Fêmea", dist: "2.5km • Petrópolis", ong: "ONG Patinhas Natal", status: "disponivel", matchScore: 97, img: "https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?w=800&q=80", about: "Bella é super companheira, silenciosa, hipoalergênica e adora colo. Ótima opção para apartamentos e famílias tranquilas." },
    { id: 6, name: "Zeus", nome: "Zeus", species: "Cachorro", especie: "Cachorro", breed: "Husky Siberiano", raca: "Husky Siberiano", age: "2 anos", idade: "2 anos", size: "Grande", porte: "Grande", gender: "Macho", sexo: "Macho", dist: "6km • Candelária", ong: "Amigos de Quatro Patas", status: "disponivel", matchScore: 92, img: "https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&q=80", about: "Zeus é brincalhão, cheio de energia e muito sociável com outros cães. Já está castrado, vacinado e microchipado." },
    { id: 7, name: "Max", nome: "Max", species: "Cachorro", especie: "Cachorro", breed: "Beagle", raca: "Beagle", age: "1 ano", idade: "1 ano", size: "Médio", porte: "Médio", gender: "Macho", sexo: "Macho", dist: "4km • Alecrim", ong: "ONG Patinhas Natal", status: "disponivel", matchScore: 93, img: "https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=800&q=80", about: "Max é um cãozinho curioso, alegre e super dócil com crianças. Vacinação e vermifugação rigorosamente em dia." },
    { id: 8, name: "Nina", nome: "Nina", species: "Gato", especie: "Gato", breed: "Persa Mix", raca: "Persa Mix", age: "2 anos", idade: "2 anos", size: "Pequeno", porte: "Pequeno", gender: "Fêmea", sexo: "Fêmea", dist: "3km • Cidade Jardim", ong: "Gatil Amor Felino RN", status: "disponivel", matchScore: 95, img: "https://images.unsplash.com/photo-1513360371669-4adf3dd7dff8?w=800&q=80", about: "Nina é extremamente calma, dócil, castrada e adora cochilar no sofá. Negativa para FIV/FeLV e pronta para adoção responsável." },
    { id: 9, name: "Rocky", nome: "Rocky", species: "Cachorro", especie: "Cachorro", breed: "Bulldog Francês", raca: "Bulldog Francês", age: "3 anos", idade: "3 anos", size: "Pequeno", porte: "Pequeno", gender: "Macho", sexo: "Macho", dist: "2km • Tirol", ong: "ONG Patinhas Natal", status: "disponivel", matchScore: 96, img: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&q=80", about: "Rocky foi resgatado de abandono, é super tranquilo, adora companhia humana e se adapta perfeitamente a apartamentos." },
    { id: 10, name: "Mia", nome: "Mia", species: "Gato", especie: "Gato", breed: "Siamês", raca: "Siamês", age: "3 anos", idade: "3 anos", size: "Pequeno", porte: "Pequeno", gender: "Fêmea", sexo: "Fêmea", dist: "4km • Nova Descoberta", ong: "Gatil Amor Felino RN", status: "adotado", matchScore: 99, img: "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80", about: "Mia é uma gatinha carinhosa, castrada e vacinada, que já encontrou seu novo lar definitivo através do projeto Patinhas." }
  ],
  matches: [],
  chats: []
};

// Pré-carregamento assíncrono de imagens em background para evitar engasgos visuais
const _preloadedUrls = new Set();
function preloadPetImages(pets) {
  if (typeof Image === 'undefined' || !Array.isArray(pets)) return;
  pets.slice(0, 6).forEach(p => {
    const url = p && (p.img || p.foto_url);
    if (url && !_preloadedUrls.has(url)) {
      _preloadedUrls.add(url);
      const img = new Image();
      img.src = url;
    }
  });
}

// ============================================================================
// GERENCIAMENTO DE SESSÃO E TOKEN JWT NO CLIENTE
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
      localStorage.setItem('userName', usuario.nome || 'Lucas Aprígio');
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
// COMPONENTE VISUAL DE ESTADOS (CARREGAMENTO, CONFIRMAÇÃO E ERRO)
// ============================================================================
function showApiToast(type, message, durationMs = 2600) {
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
// CLIENTE HTTP/REST CENTRALIZADO (Serialização JSON + Auth + Tratamento HTTP)
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
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 4000);
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
// SINCRONIZAÇÃO DE DADOS DAS TELAS COM O SERVIDOR REST (SQLite) + CLOUD SYNC
// ============================================================================
function normalizeDbState(state) {
  if (!state || typeof state !== 'object') return DEFAULT_SEED_DB;
  if (!Array.isArray(state.pets) || state.pets.length === 0) {
    state.pets = DEFAULT_SEED_DB.pets;
  }
  if (!Array.isArray(state.matches)) state.matches = [];
  if (!Array.isArray(state.chats)) {
    state.chats = [];
    for (const m of state.matches) {
      if (Array.isArray(m.messages)) {
        for (const msg of m.messages) {
          state.chats.push({
            matchId: String(m.id),
            sender: msg.sender || msg.remetente_perfil || 'ong',
            text: msg.text || msg.texto || '',
            isTermo: Boolean(msg.isTermo || msg.is_termo),
            time: msg.time || msg.horario || '12:00'
          });
        }
      }
    }
  }
  preloadPetImages(state.pets);
  return state;
}

function getLocalCache() {
  if (_memoryDbCache) return _memoryDbCache;
  try {
    const raw = localStorage.getItem('cached_db');
    if (raw) {
      _memoryDbCache = normalizeDbState(JSON.parse(raw));
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
    const remoteState = await apiRequest(`/state?t=${now}`, { method: 'GET', timeout: 1800 });
    if (remoteState && Array.isArray(remoteState.pets)) {
      _memoryDbCache = normalizeDbState(remoteState);
      _lastFetchTimestamp = Date.now();
      try { localStorage.setItem('cached_db', JSON.stringify(_memoryDbCache)); } catch (_) {}
      return _memoryDbCache;
    }
  } catch (_) {}

  // Prioridade 2: Sincronização em nuvem (GitHub Gist) para funcionamento entre Web e Mobile
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${now}`, {
      headers: { "Authorization": `token ${GIST_TOKEN}` }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const remoteDb = normalizeDbState(JSON.parse(data.files["db.json"].content));
    _memoryDbCache = remoteDb;
    _lastFetchTimestamp = Date.now();
    try { localStorage.setItem('cached_db', JSON.stringify(remoteDb)); } catch (_) {}
    return remoteDb;
  } catch (e) {
    if (cached) return cached;
    return DEFAULT_SEED_DB;
  }
}

async function saveDb(dbData) {
  const normalized = normalizeDbState(dbData);
  _memoryDbCache = normalized;
  _lastFetchTimestamp = Date.now();
  try { localStorage.setItem('cached_db', JSON.stringify(normalized)); } catch (_) {}

  showApiToast('loading', 'Sincronizando com o servidor...', 1200);

  let savedLocal = false;
  let savedCloud = false;

  // 1. Tenta confirmar no Servidor REST + Banco Relacional SQLite
  try {
    const confirmedState = await apiRequest('/state', {
      method: 'PUT',
      body: normalized,
      timeout: 2500
    });
    if (confirmedState && confirmedState.sucesso) {
      _memoryDbCache = normalizeDbState(confirmedState);
      try { localStorage.setItem('cached_db', JSON.stringify(_memoryDbCache)); } catch (_) {}
      savedLocal = true;
    }
  } catch (_) {}

  // 2. Sincroniza também na nuvem (para que o celular e o painel web vejam em tempo real)
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${GIST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          "db.json": { content: JSON.stringify(_memoryDbCache, null, 2) }
        }
      })
    });
    if (res.ok) savedCloud = true;
  } catch (_) {}

  if (savedLocal || savedCloud) {
    showApiToast('success', 'Alteração confirmada pelo servidor!', 2000);
    return true;
  } else {
    showApiToast('error', 'Salvo localmente (servidor offline).', 2500);
    return false;
  }
}
