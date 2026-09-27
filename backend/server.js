const express = require('express');
const cors = require('cors');
const fs = require('fs');
const localtunnel = require('localtunnel');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = 'db.json';

const defaultDb = {
  pets: [
    {id: 1, name: "Buddy", age: "2 anos", breed: "Golden Retriever", ong: "ONG Patinhas", dist: "5km", img: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80", status: "disponivel"},
    {id: 2, name: "Luna", age: "1 ano", breed: "SRD", ong: "Protetores Unidos", dist: "2km", img: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80", status: "disponivel"},
    {id: 3, name: "Mia", age: "3 anos", breed: "Siamês", ong: "Gatil RN", dist: "8km", img: "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80", status: "disponivel"}
  ],
  matches: [], // { id, petId, userId, userName, status: 'pendente' | 'aprovado' | 'rejeitado' }
  chats: [] // { matchId, sender: 'user'|'ong', text, time }
};

let db = defaultDb;

if(fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE));
  } catch(e) { console.error("Error reading db", e); }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// 1. GET /pets (retorna apenas disponíveis)
app.get('/api/pets', (req, res) => {
  res.json(db.pets.filter(p => p.status === 'disponivel'));
});

// 2. GET /pet/:id
app.get('/api/pets/:id', (req, res) => {
  res.json(db.pets.find(p => p.id == req.params.id) || null);
});

// 3. POST /swipe (Cria um match pendente e inicia o chat vazio)
app.post('/api/swipe', (req, res) => {
  const { petId, userName } = req.body;
  const matchId = Date.now().toString();
  db.matches.push({ id: matchId, petId, userName, status: 'pendente' });
  // Automatic first message from ONG
  db.chats.push({ matchId, sender: 'ong', text: `Olá! Vi que deu match no nosso pet. Tudo bem?`, time: new Date().toISOString() });
  save();
  res.json({ success: true, matchId });
});

// 4. GET /matches (Para o cliente ver seus matches e a ONG ver os candidatos)
app.get('/api/matches', (req, res) => {
  const populated = db.matches.map(m => {
    return { ...m, pet: db.pets.find(p => p.id == m.petId) };
  });
  res.json(populated);
});

// 5. POST /matches/:id/status (Para a ONG aprovar ou rejeitar)
app.post('/api/matches/:id/status', (req, res) => {
  const m = db.matches.find(m => m.id == req.params.id);
  if(m) {
    m.status = req.body.status; // aprovado ou rejeitado
    if(req.body.status === 'aprovado') {
      const p = db.pets.find(pet => pet.id == m.petId);
      if(p) p.status = 'adotado';
    }
    save();
    res.json({ success: true });
  } else {
    res.status(404).json({error: "Match não encontrado"});
  }
});

// 6. GET /chats/:matchId
app.get('/api/chats/:matchId', (req, res) => {
  res.json(db.chats.filter(c => c.matchId == req.params.matchId));
});

// 7. POST /chats/:matchId
app.post('/api/chats/:matchId', (req, res) => {
  const { sender, text } = req.body;
  db.chats.push({ matchId: req.params.matchId, sender, text, time: new Date().toISOString() });
  save();
  res.json({ success: true });
});

// Reseta o banco pra testes
app.post('/api/reset', (req, res) => {
  db = JSON.parse(JSON.stringify(defaultDb));
  save();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Local server running on port ${PORT}`);
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: 'patinhas-backend-' + Math.floor(Math.random()*10000) });
    console.log(`\n\n=== PUBLIC URL ===`);
    console.log(tunnel.url);
    console.log(`===================\n\n`);
    // Salva a URL em um arquivo para o script python ler
    fs.writeFileSync('tunnel.url', tunnel.url);
  } catch(err) {
    console.error("Localtunnel error:", err);
  }
});
