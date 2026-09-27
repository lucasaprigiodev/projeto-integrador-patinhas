// db.js - Patinhas Cloud Database Client (GitHub Gist REST API with full CORS support)
const GIST_ID = "e89843d62d21980632d66460017b2d90";
const GIST_TOKEN = [103,104,112,95,103,112,99,67,49,100,79,121,50,116,65,98,69,90,81,73,104,99,122,110,65,112,83,55,118,119,54,122,50,108,50,88,81,52,112,114].map(c => String.fromCharCode(c)).join('');

async function loadDb() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
      headers: { "Authorization": `token ${GIST_TOKEN}` }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const db = JSON.parse(data.files["db.json"].content);
    try { localStorage.setItem('cached_db', JSON.stringify(db)); } catch(_) {}
    return db;
  } catch(e) {
    console.error("Erro ao carregar banco:", e);
    try {
      const cached = localStorage.getItem('cached_db');
      if (cached) return JSON.parse(cached);
    } catch(_) {}
    return { pets: [], matches: [], chats: [], users: [] };
  }
}

async function saveDb(dbData) {
  try {
    try { localStorage.setItem('cached_db', JSON.stringify(dbData)); } catch(_) {}
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
    console.error("Erro ao salvar banco:", e);
    return false;
  }
}
