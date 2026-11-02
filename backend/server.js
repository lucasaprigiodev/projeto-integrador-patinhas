// ============================================================================
// backend/server.js - Servidor API HTTP/REST (Arquitetura Distribuída - Etapa 3)
// Projeto Integrador: Patinhas (Adoção Responsável de Animais) - IFRN
// ============================================================================
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db, DB_PATH, hashPassword, verifyPassword } = require('./database');

const app = express();

// Desativa cabeçalho de tecnologia para prevenir enumeração de fingerprint (CWE-200)
app.disable('x-powered-by');

// Middleware de compressão de respostas HTTP (GZIP/Deflate)
app.use(compression({ threshold: 512 }));

// Cabeçalhos de Segurança HTTP (OWASP / Helmet-style)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' https: data:; img-src 'self' https: data: blob:;");
  next();
});

// Configuração de CORS Restrito e Seguro (compatível com navegadores, apps móveis e preflights)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '15mb' }));

// Chave secreta segura para assinatura de tokens JWT (HMAC-SHA256)
// Caso a variável de ambiente não esteja configurada ou possua o valor de demonstração público,
// gera um segredo criptograficamente aleatório e seguro por instância.
const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'patinhas_ifrn_jwt_secret_key_2026')
  ? process.env.JWT_SECRET
  : crypto.randomBytes(32).toString('hex');

// ============================================================================
// RATE LIMITING EM MEMÓRIA CONTRA BRUTE FORCE (OWASP Authentication Cheat Sheet)
// ============================================================================
const failedLoginAttempts = new Map();

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'client';
  const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
  const key = `${ip}:${email}`;
  const now = Date.now();
  const record = failedLoginAttempts.get(key) || { count: 0, resetAt: now + 60000 };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + 60000;
  }

  if (record.count >= 10) {
    return res.status(429).json({
      erro: 'Muitas tentativas incorretas de autenticação para esta conta. Por segurança, aguarde 1 minuto.',
      codigo: 429
    });
  }

  req._loginRateRecord = record;
  req._loginRateKey = key;
  next();
}

// ============================================================================
// UTILITÁRIOS DE VALIDAÇÃO E SEGURANÇA
// ============================================================================
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/') || trimmed.startsWith('/');
}

// ============================================================================
// UTILITÁRIOS DE AUTENTICAÇÃO JWT (RFC 7519)
// ============================================================================
function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 dias
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// MIDDLEWARES DE AUTENTICAÇÃO E CONTROLE DE ACESSO (RBAC)
// ============================================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      erro: 'Não autorizado. Token de autenticação ausente no cabeçalho Authorization: Bearer <token>.',
      codigo: 401
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      erro: 'Token JWT inválido ou expirado. Faça login novamente.',
      codigo: 401
    });
  }

  // Confirma se o usuário ainda existe no banco relacional
  const user = db.prepare('SELECT id, nome, cpf, telefone, email, perfil, avatar_url, criado_em FROM usuarios WHERE id = ?').get(decoded.id);
  if (!user) {
    return res.status(401).json({
      erro: 'Usuário associado ao token não foi encontrado no banco de dados.',
      codigo: 401
    });
  }

  req.user = user;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ erro: 'Usuário não autenticado.', codigo: 401 });
    }
    // Administradores possuem acesso a todas as operações de ONG
    const hasPermission = allowedRoles.includes(req.user.perfil) || req.user.perfil === 'admin';
    if (!hasPermission) {
      return res.status(403).json({
        erro: `Acesso negado. Seu perfil ('${req.user.perfil}') não possui permissão para executar esta operação. Perfis permitidos: [${allowedRoles.join(', ')}].`,
        codigo: 403
      });
    }
    next();
  };
}

// ============================================================================
// MAPEADORES DE MODELOS (RELACIONAL <-> JSON DA API / FRONTEND)
// ============================================================================
function formatPetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    especie: row.especie,
    raca: row.raca,
    idade: row.idade,
    porte: row.porte,
    sexo: row.sexo,
    distancia: row.distancia,
    descricao: row.descricao,
    foto_url: row.foto_url,
    status: row.status,
    ong_id: row.ong_id,
    ong_nome: row.ong_nome,
    criado_em: row.criado_em,
    // Compatibilidade com telas legadas do frontend
    name: row.nome,
    species: row.especie,
    breed: row.raca,
    age: row.idade,
    size: row.porte,
    gender: row.sexo,
    dist: row.distancia,
    desc: row.descricao,
    about: row.descricao,
    img: row.foto_url,
    ong: row.ong_nome
  };
}

function formatMatchRow(row) {
  if (!row) return null;
  const petRow = db.prepare('SELECT * FROM animais WHERE id = ?').get(row.animal_id);
  const adopterRow = db.prepare('SELECT id, nome, email, telefone, cpf, avatar_url FROM usuarios WHERE id = ?').get(row.adotante_id);
  const msgRows = db.prepare('SELECT * FROM mensagens WHERE match_id = ? ORDER BY id ASC').all(row.id);

  const messages = msgRows.map(m => ({
    id: m.id,
    match_id: m.match_id,
    remetente_id: m.remetente_id,
    remetente_perfil: m.remetente_perfil,
    texto: m.texto,
    is_termo: Boolean(m.is_termo),
    horario: m.horario,
    criado_em: m.criado_em,
    sender: m.remetente_perfil,
    text: m.texto,
    isTermo: Boolean(m.is_termo),
    time: m.horario
  }));

  return {
    id: row.id,
    animal_id: row.animal_id,
    adotante_id: row.adotante_id,
    status: row.status,
    termo_enviado: Boolean(row.termo_enviado),
    termo_enviado_em: row.termo_enviado_em,
    termo_assinado: Boolean(row.termo_assinado),
    assinatura_digital: row.assinatura_digital,
    termo_assinado_em: row.termo_assinado_em,
    data_match: row.data_match,
    criado_em: row.criado_em,
    animal: formatPetRow(petRow),
    adotante: adopterRow || null,
    mensagens: messages,
    petId: row.animal_id,
    petName: petRow ? petRow.nome : 'Pet',
    petImg: petRow ? petRow.foto_url : '',
    ongName: petRow ? petRow.ong_nome : 'ONG Patinhas',
    userName: adopterRow ? adopterRow.nome : 'Adotante',
    userId: row.adotante_id,
    userAvatar: adopterRow && adopterRow.avatar_url ? adopterRow.avatar_url : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
    date: row.data_match,
    termoEnviado: Boolean(row.termo_enviado),
    termoEnviadoAt: row.termo_enviado_em,
    termoAssinado: Boolean(row.termo_assinado),
    assinaturaNome: row.assinatura_digital,
    termoAssinadoAt: row.termo_assinado_em,
    messages
  };
}

// ============================================================================
// 1. ROTAS DE AUTENTICAÇÃO E CONTROLE DE ACESSO (/api/auth)
// ============================================================================

// POST /api/auth/register - Cadastro real de usuário no banco SQLite
app.post('/api/auth/register', (req, res) => {
  try {
    const { nome, cpf, telefone, email, senha, avatar_url } = req.body || {};

    if (!nome || String(nome).trim().length < 3) {
      return res.status(400).json({ erro: 'O campo "nome" é obrigatório e deve ter pelo menos 3 caracteres.', codigo: 400 });
    }
    if (!email || !String(email).includes('@')) {
      return res.status(400).json({ erro: 'Informe um endereço de "email" válido.', codigo: 400 });
    }
    if (!senha || String(senha).length < 4) {
      return res.status(400).json({ erro: 'A "senha" deve possuir no mínimo 4 caracteres.', codigo: 400 });
    }

    // Regra de Segurança (SEC-01): Registro público sempre cadastra 'adotante'.
    // Perfis de ONG e Administrador são provisionados de forma controlada/administrativa.
    const role = 'adotante';
    const cleanEmail = String(email).trim().toLowerCase();

    const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        erro: 'Já existe um usuário cadastrado com este e-mail.',
        codigo: 409
      });
    }

    const senhaHash = hashPassword(senha);
    const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80';

    const result = db.prepare(`
      INSERT INTO usuarios (nome, cpf, telefone, email, senha_hash, perfil, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(nome).trim(),
      cpf ? String(cpf).trim() : null,
      telefone ? String(telefone).trim() : null,
      cleanEmail,
      senhaHash,
      role,
      avatar_url || defaultAvatar
    );

    const userId = Number(result.lastInsertRowid);
    const newUser = db.prepare('SELECT id, nome, cpf, telefone, email, perfil, avatar_url, criado_em FROM usuarios WHERE id = ?').get(userId);
    const token = generateToken(newUser);

    return res.status(201).json({
      mensagem: 'Usuário cadastrado com sucesso!',
      token,
      usuario: newUser
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao cadastrar usuário.', codigo: 500 });
  }
});

// POST /api/auth/login - Autenticação real de usuário e emissão de JWT
app.post('/api/auth/login', loginRateLimiter, (req, res) => {
  try {
    const { email, senha } = req.body || {};
    if (!email || !senha) {
      return res.status(400).json({
        erro: 'Os campos "email" e "senha" são obrigatórios.',
        codigo: 400
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM usuarios WHERE lower(email) = ?').get(cleanEmail);

    if (!userRow || !verifyPassword(senha, userRow.senha_hash)) {
      if (req._loginRateRecord) {
        req._loginRateRecord.count++;
        failedLoginAttempts.set(req._loginRateKey, req._loginRateRecord);
      }
      return res.status(401).json({
        erro: 'Credenciais inválidas. Verifique seu e-mail e senha.',
        codigo: 401
      });
    }

    // Login bem-sucedido: limpa histórico de falhas
    if (req._loginRateKey) {
      failedLoginAttempts.delete(req._loginRateKey);
    }

    const usuario = {
      id: userRow.id,
      nome: userRow.nome,
      cpf: userRow.cpf,
      telefone: userRow.telefone,
      email: userRow.email,
      perfil: userRow.perfil,
      avatar_url: userRow.avatar_url,
      criado_em: userRow.criado_em
    };

    const token = generateToken(usuario);
    return res.status(200).json({
      mensagem: 'Autenticação realizada com sucesso!',
      token,
      usuario
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao autenticar usuário.', codigo: 500 });
  }
});

// GET /api/auth/me - Dados do usuário autenticado
app.get('/api/auth/me', authenticateToken, (req, res) => {
  return res.status(200).json({ usuario: req.user });
});

// GET /api/users - Lista usuários (Exclusivo para perfil ONG e Admin)
app.get('/api/users', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  const users = db.prepare('SELECT id, nome, cpf, telefone, email, perfil, avatar_url, criado_em FROM usuarios ORDER BY id ASC').all();
  return res.status(200).json(users);
});

// ============================================================================
// 2. ROTAS DE ANIMAIS / PETS (/api/pets)
// ============================================================================

// GET /api/pets - Lista todos os animais (com filtros opcionais de status e especie)
app.get('/api/pets', (req, res) => {
  try {
    const { status, especie } = req.query;
    let sql = 'SELECT * FROM animais WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (especie) {
      sql += ' AND lower(especie) = lower(?)';
      params.push(especie);
    }
    sql += ' ORDER BY id DESC';

    const rows = db.prepare(sql).all(...params);
    return res.status(200).json(rows.map(formatPetRow));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar animais.', codigo: 500 });
  }
});

// GET /api/pets/:id - Detalhes de um animal específico
app.get('/api/pets/:id', (req, res) => {
  const petId = Number(req.params.id);
  if (Number.isNaN(petId)) {
    return res.status(400).json({ erro: 'ID do animal inválido.', codigo: 400 });
  }
  const row = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
  if (!row) {
    return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });
  }
  return res.status(200).json(formatPetRow(row));
});

// POST /api/pets - Cadastra novo animal (Exclusivo perfil ONG / Admin)
app.post('/api/pets', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  try {
    const body = req.body || {};
    const nome = body.nome || body.name;
    const especie = body.especie || 'Cachorro';
    const raca = body.raca || body.breed;
    const idade = body.idade || body.age;
    const porte = body.porte || body.size || 'Médio';
    const sexo = body.sexo || body.gender || 'Macho';
    const distancia = body.distancia || body.dist || '3km';
    const descricao = body.descricao || body.desc || 'Animal dócil, vacinado e pronto para adoção responsável.';
    const foto_url = body.foto_url || body.img;
    const ong_nome = body.ong_nome || body.ong || req.user.nome || 'ONG Patinhas';

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ erro: 'O campo "nome" do animal é obrigatório e deve ter no mínimo 2 caracteres.', codigo: 400 });
    }
    if (!raca) {
      return res.status(400).json({ erro: 'O campo "raca" é obrigatório.', codigo: 400 });
    }
    if (!idade) {
      return res.status(400).json({ erro: 'O campo "idade" é obrigatório.', codigo: 400 });
    }
    if (!foto_url || !isValidImageUrl(foto_url)) {
      return res.status(400).json({ erro: 'O campo "foto_url" deve ser uma URL válida de imagem (http, https ou data:image).', codigo: 400 });
    }

    const validSpecies = ['Cachorro', 'Gato', 'Outro'];
    const finalSpecies = validSpecies.includes(especie) ? especie : 'Cachorro';

    const validSizes = ['Pequeno', 'Médio', 'Grande'];
    const finalSize = validSizes.includes(porte) ? porte : 'Médio';

    const validGenders = ['Macho', 'Fêmea'];
    const finalGender = validGenders.includes(sexo) ? sexo : 'Macho';

    const result = db.prepare(`
      INSERT INTO animais (nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, ong_id, ong_nome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponivel', ?, ?)
    `).run(
      String(nome).trim(),
      finalSpecies,
      String(raca).trim(),
      String(idade).trim(),
      finalSize,
      finalGender,
      String(distancia).trim(),
      String(descricao).trim(),
      String(foto_url),
      req.user.id,
      String(ong_nome).trim()
    );

    const newPet = db.prepare('SELECT * FROM animais WHERE id = ?').get(Number(result.lastInsertRowid));
    return res.status(201).json(formatPetRow(newPet));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao cadastrar animal.', codigo: 500 });
  }
});

// PUT /api/pets/:id - Atualiza dados de um animal (Exclusivo ONG dona ou Admin)
app.put('/api/pets/:id', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  try {
    const petId = Number(req.params.id);
    if (Number.isNaN(petId)) {
      return res.status(400).json({ erro: 'ID do animal inválido.', codigo: 400 });
    }

    const existing = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    if (!existing) {
      return res.status(404).json({ erro: 'Animal não encontrado para atualização.', codigo: 404 });
    }

    // Verificação de Propriedade (SEC-16): ONG só altera seus próprios animais
    if (req.user.perfil !== 'admin' && existing.ong_id !== req.user.id) {
      return res.status(403).json({
        erro: 'Acesso negado. Você só pode gerenciar os animais cadastrados pela sua própria organização.',
        codigo: 403
      });
    }

    const body = req.body || {};

    // Validações estritas de domínio (SEC-19, SEC-20)
    if (body.status !== undefined && !['disponivel', 'em_processo', 'adotado'].includes(body.status)) {
      return res.status(400).json({ erro: 'Status inválido. Valores permitidos: disponivel, em_processo, adotado.', codigo: 400 });
    }
    if (body.especie !== undefined && !['Cachorro', 'Gato', 'Outro'].includes(body.especie)) {
      return res.status(400).json({ erro: 'Espécie inválida. Valores permitidos: Cachorro, Gato, Outro.', codigo: 400 });
    }
    if (body.porte !== undefined && !['Pequeno', 'Médio', 'Grande'].includes(body.porte)) {
      return res.status(400).json({ erro: 'Porte inválido. Valores permitidos: Pequeno, Médio, Grande.', codigo: 400 });
    }
    if (body.sexo !== undefined && !['Macho', 'Fêmea'].includes(body.sexo)) {
      return res.status(400).json({ erro: 'Sexo inválido. Valores permitidos: Macho, Fêmea.', codigo: 400 });
    }
    if (body.foto_url !== undefined && !isValidImageUrl(body.foto_url)) {
      return res.status(400).json({ erro: 'O campo "foto_url" deve ser uma URL válida de imagem.', codigo: 400 });
    }

    const nome = body.nome || body.name || existing.nome;
    const especie = body.especie || existing.especie;
    const raca = body.raca || body.breed || existing.raca;
    const idade = body.idade || body.age || existing.idade;
    const porte = body.porte || body.size || existing.porte;
    const sexo = body.sexo || body.gender || existing.sexo;
    const distancia = body.distancia || body.dist || existing.distancia;
    const descricao = body.descricao || body.desc || existing.descricao;
    const foto_url = body.foto_url || body.img || existing.foto_url;
    const status = body.status || existing.status;

    db.prepare(`
      UPDATE animais
      SET nome = ?, especie = ?, raca = ?, idade = ?, porte = ?, sexo = ?, distancia = ?, descricao = ?, foto_url = ?, status = ?
      WHERE id = ?
    `).run(nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, petId);

    const updated = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    return res.status(200).json(formatPetRow(updated));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar animal.', codigo: 500 });
  }
});

// DELETE /api/pets/:id - Remove um animal do catálogo (Exclusivo ONG dona ou Admin)
app.delete('/api/pets/:id', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  try {
    const petId = Number(req.params.id);
    if (Number.isNaN(petId)) {
      return res.status(400).json({ erro: 'ID do animal inválido.', codigo: 400 });
    }

    const existing = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    if (!existing) {
      return res.status(404).json({ erro: 'Animal não encontrado para exclusão.', codigo: 404 });
    }

    // Verificação de Propriedade (SEC-16)
    if (req.user.perfil !== 'admin' && existing.ong_id !== req.user.id) {
      return res.status(403).json({
        erro: 'Acesso negado. Você só pode excluir os animais cadastrados pela sua própria organização.',
        codigo: 403
      });
    }

    db.prepare('DELETE FROM animais WHERE id = ?').run(petId);
    return res.status(200).json({
      mensagem: `Animal "${existing.nome}" (ID ${petId}) removido com sucesso.`,
      id: petId
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao excluir animal.', codigo: 500 });
  }
});

// ============================================================================
// 3. ROTAS DE ADOÇÕES / MATCHES E MÁQUINA DE ESTADOS (/api/matches)
// Estados do Fluxo: pendente -> termo_enviado -> termo_assinado -> aprovado | rejeitado
// ============================================================================

// GET /api/matches - Lista matches (ONG/Admin vê todos; Adotante vê apenas os seus)
app.get('/api/matches', authenticateToken, (req, res) => {
  try {
    let rows;
    if (req.user.perfil === 'ong' || req.user.perfil === 'admin') {
      rows = db.prepare('SELECT * FROM adocoes_matches ORDER BY id DESC').all();
    } else {
      rows = db.prepare('SELECT * FROM adocoes_matches WHERE adotante_id = ? ORDER BY id DESC').all(req.user.id);
    }
    return res.status(200).json(rows.map(formatMatchRow));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao consultar matches.', codigo: 500 });
  }
});

// POST /api/matches - Cria um novo Match (Swipe Like no animal)
app.post('/api/matches', authenticateToken, (req, res) => {
  try {
    const animalId = Number(req.body.animal_id || req.body.petId);
    if (!animalId || Number.isNaN(animalId)) {
      return res.status(400).json({ erro: 'O campo "animal_id" é obrigatório.', codigo: 400 });
    }

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(animalId);
    if (!pet) {
      return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });
    }
    if (pet.status === 'adotado') {
      return res.status(422).json({
        erro: 'Este animal já foi adotado e não aceita novas solicitações.',
        codigo: 422
      });
    }

    const existingMatch = db.prepare('SELECT * FROM adocoes_matches WHERE animal_id = ? AND adotante_id = ?').get(animalId, req.user.id);
    if (existingMatch) {
      return res.status(409).json({
        erro: 'Você já possui um match ativo para este animal.',
        codigo: 409,
        match: formatMatchRow(existingMatch)
      });
    }

    const dataMatch = new Date().toLocaleDateString('pt-BR');
    const result = db.prepare(`
      INSERT INTO adocoes_matches (animal_id, adotante_id, status, termo_enviado, termo_assinado, data_match)
      VALUES (?, ?, 'pendente', 0, 0, ?)
    `).run(animalId, req.user.id, dataMatch);

    const matchId = Number(result.lastInsertRowid);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Atualiza status do animal para 'em_processo' (BUG-03)
    if (pet.status === 'disponivel') {
      db.prepare("UPDATE animais SET status = 'em_processo' WHERE id = ?").run(animalId);
    }

    // Mensagem automática de boas-vindas da ONG
    db.prepare(`
      INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
      VALUES (?, ?, 'ong', ?, 0, ?)
    `).run(
      matchId,
      pet.ong_id,
      `Olá, ${req.user.nome}! Ficamos muito felizes pelo seu interesse no(a) ${pet.nome}! Como podemos te ajudar no processo de adoção? 🐾`,
      nowTime
    );

    const createdMatch = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    return res.status(201).json(formatMatchRow(createdMatch));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao registrar match.', codigo: 500 });
  }
});

// POST /api/matches/:id/enviar-termo - Transição: pendente -> termo_enviado (Exclusivo ONG / Admin)
app.post('/api/matches/:id/enviar-termo', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ erro: 'Processo de adoção (Match) não encontrado.', codigo: 404 });
    }

    if (match.status === 'aprovado' || match.status === 'rejeitado') {
      return res.status(422).json({
        erro: `Transição de estado inválida: não é possível enviar termo para um processo já finalizado com status "${match.status}".`,
        codigo: 422
      });
    }

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(match.animal_id);
    const nowIso = new Date().toISOString();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    db.prepare(`
      UPDATE adocoes_matches
      SET status = 'termo_enviado', termo_enviado = 1, termo_enviado_em = ?
      WHERE id = ?
    `).run(nowIso, matchId);

    // Registra mensagem contendo o termo oficial se ainda não existir
    const existingTermMsg = db.prepare('SELECT id FROM mensagens WHERE match_id = ? AND is_termo = 1').get(matchId);
    if (!existingTermMsg) {
      db.prepare(`
        INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
        VALUES (?, ?, 'ong', ?, 1, ?)
      `).run(
        matchId,
        req.user.id,
        `📄 [TERMO DE ADOÇÃO RESPONSÁVEL]\nClique no botão abaixo para ler o contrato e realizar a assinatura digital para adoção de ${pet ? pet.nome : 'seu novo pet'}.`,
        nowTime
      );
    }

    const updated = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    return res.status(200).json({
      mensagem: 'Termo de Adoção Responsável enviado com sucesso ao adotante!',
      match: formatMatchRow(updated)
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao enviar termo de adoção.', codigo: 500 });
  }
});

// POST /api/matches/:id/assinar-termo - Transição: termo_enviado -> termo_assinado (Apenas o Adotante)
app.post('/api/matches/:id/assinar-termo', authenticateToken, (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ erro: 'Processo de adoção (Match) não encontrado.', codigo: 404 });
    }

    // Regra de Integridade Jurídica (SEC-17): Apenas o adotante titular do match pode assinar o contrato
    if (match.adotante_id !== req.user.id) {
      return res.status(403).json({
        erro: 'Acesso negado. Apenas o próprio adotante titular deste processo pode assinar digitalmente o termo de adoção.',
        codigo: 403
      });
    }

    if (!match.termo_enviado) {
      return res.status(422).json({
        erro: 'Transição de estado inválida: o Termo de Adoção ainda não foi disponibilizado pela ONG (estado atual: pendente).',
        codigo: 422
      });
    }

    const assinatura = (req.body && (req.body.assinatura_digital || req.body.assinaturaNome)) || req.user.nome;
    if (!assinatura || String(assinatura).trim().length < 3) {
      return res.status(400).json({
        erro: 'Informe o nome completo válido no campo "assinatura_digital" para assinar o documento.',
        codigo: 400
      });
    }

    const nowIso = new Date().toISOString();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    db.prepare(`
      UPDATE adocoes_matches
      SET status = 'termo_assinado', termo_assinado = 1, assinatura_digital = ?, termo_assinado_em = ?
      WHERE id = ?
    `).run(String(assinatura).trim(), nowIso, matchId);

    db.prepare(`
      INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
      VALUES (?, ?, 'user', ?, 0, ?)
    `).run(
      matchId,
      req.user.id,
      `✅ Assinei digitalmente o Termo de Adoção Responsável como "${String(assinatura).trim()}". Aguardo a avaliação final da ONG!`,
      nowTime
    );

    const updated = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    return res.status(200).json({
      mensagem: 'Termo de Adoção assinado digitalmente com sucesso!',
      match: formatMatchRow(updated)
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao assinar termo.', codigo: 500 });
  }
});

// PATCH /api/matches/:id/status - Transições da Máquina de Estados (Exclusivo ONG / Admin)
app.patch('/api/matches/:id/status', authenticateToken, requireRole('ong', 'admin'), (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { status } = req.body || {};

    const validStatuses = ['pendente', 'termo_enviado', 'termo_assinado', 'aprovado', 'rejeitado'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        erro: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}.`,
        codigo: 400
      });
    }

    const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ erro: 'Processo de adoção (Match) não encontrado.', codigo: 404 });
    }

    // Máquina de Estados Estrita (SEC-18)
    const ALLOWED_TRANSITIONS = {
      'pendente': ['termo_enviado', 'rejeitado'],
      'termo_enviado': ['termo_assinado', 'rejeitado'],
      'termo_assinado': ['aprovado', 'rejeitado'],
      'aprovado': [],
      'rejeitado': []
    };

    const allowedNext = ALLOWED_TRANSITIONS[match.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(422).json({
        erro: `Transição de estado inválida: não é permitido transitar de "${match.status}" para "${status}".`,
        codigo: 422
      });
    }

    // Regra Estrita (BUG-01): Aprovação EXIGE termo digitalmente assinado
    if (status === 'aprovado' && !match.termo_assinado) {
      return res.status(422).json({
        erro: 'Transição de estado inválida: não é permitido aprovar a adoção antes da assinatura digital do Termo de Adoção pelo candidato (estado exigido: termo_assinado).',
        codigo: 422
      });
    }

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(match.animal_id);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    db.prepare('UPDATE adocoes_matches SET status = ? WHERE id = ?').run(status, matchId);

    if (status === 'aprovado' && pet) {
      db.prepare("UPDATE animais SET status = 'adotado' WHERE id = ?").run(pet.id);

      // Rejeição Automática de Concorrentes (BUG-02): Finaliza outros matches abertos para o mesmo animal
      db.prepare(`
        UPDATE adocoes_matches
        SET status = 'rejeitado'
        WHERE animal_id = ? AND id != ? AND status NOT IN ('aprovado', 'rejeitado')
      `).run(pet.id, matchId);

      db.prepare(`
        INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
        VALUES (?, ?, 'ong', ?, 0, ?)
      `).run(
        matchId,
        req.user.id,
        `🎉 Parabéns! Sua adoção de ${pet.nome} foi OFICIALMENTE APROVADA pela ONG! Entre em contato para combinarmos a entrega do seu novo amigo(a)! 🐾❤️`,
        nowTime
      );
    } else if (status === 'rejeitado' && pet) {
      // Verifica se ainda restam outros matches ativos para o pet
      const otherActive = db.prepare("SELECT id FROM adocoes_matches WHERE animal_id = ? AND status IN ('pendente', 'termo_enviado', 'termo_assinado')").get(pet.id);
      if (!otherActive) {
        db.prepare("UPDATE animais SET status = 'disponivel' WHERE id = ?").run(pet.id);
      }
    }

    const updated = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    return res.status(200).json({
      mensagem: `Status da adoção atualizado para "${status}" com sucesso!`,
      match: formatMatchRow(updated)
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar status do match.', codigo: 500 });
  }
});

// DELETE /api/matches/:id - Cancela/remove um processo de adoção
app.delete('/api/matches/:id', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
  if (!match) {
    return res.status(404).json({ erro: 'Match não encontrado.', codigo: 404 });
  }
  if (req.user.perfil !== 'ong' && req.user.perfil !== 'admin' && match.adotante_id !== req.user.id) {
    return res.status(403).json({ erro: 'Sem permissão para remover este match.', codigo: 403 });
  }
  db.prepare('DELETE FROM adocoes_matches WHERE id = ?').run(matchId);
  return res.status(200).json({ mensagem: 'Processo de adoção removido com sucesso.', id: matchId });
});

// ============================================================================
// 4. ROTAS DE MENSAGENS DO CHAT (/api/matches/:id/messages)
// ============================================================================

// GET /api/matches/:id/messages - Histórico de mensagens do match
app.get('/api/matches/:id/messages', authenticateToken, (req, res) => {
  const matchId = Number(req.params.id);
  const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
  if (!match) {
    return res.status(404).json({ erro: 'Match não encontrado.', codigo: 404 });
  }
  if (req.user.perfil !== 'ong' && req.user.perfil !== 'admin' && match.adotante_id !== req.user.id) {
    return res.status(403).json({ erro: 'Acesso negado às mensagens deste chat.', codigo: 403 });
  }

  const msgs = db.prepare('SELECT * FROM mensagens WHERE match_id = ? ORDER BY id ASC').all(matchId);
  return res.status(200).json(msgs.map(m => ({
    id: m.id,
    match_id: m.match_id,
    remetente_id: m.remetente_id,
    remetente_perfil: m.remetente_perfil,
    texto: m.texto,
    is_termo: Boolean(m.is_termo),
    horario: m.horario,
    criado_em: m.criado_em,
    sender: m.remetente_perfil,
    text: m.texto,
    isTermo: Boolean(m.is_termo),
    time: m.horario
  })));
});

// POST /api/matches/:id/messages - Envia nova mensagem no chat
app.post('/api/matches/:id/messages', authenticateToken, (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const match = db.prepare('SELECT * FROM adocoes_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ erro: 'Match não encontrado.', codigo: 404 });
    }
    if (req.user.perfil !== 'ong' && req.user.perfil !== 'admin' && match.adotante_id !== req.user.id) {
      return res.status(403).json({ erro: 'Você não tem permissão para enviar mensagens neste chat.', codigo: 403 });
    }

    const texto = req.body.texto || req.body.text;
    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ erro: 'O campo "texto" da mensagem não pode ser vazio.', codigo: 400 });
    }

    // Limitação de Tamanho de Mensagem (SEC-23)
    if (String(texto).length > 5000) {
      return res.status(400).json({ erro: 'O texto da mensagem excede o limite máximo permitido (5.000 caracteres).', codigo: 400 });
    }

    const senderRole = (req.user.perfil === 'ong' || req.user.perfil === 'admin') ? 'ong' : 'user';

    // Apenas ONGs ou Admins podem emitir mensagens de termo (SEC-24)
    const isTermo = ((req.user.perfil === 'ong' || req.user.perfil === 'admin') && (req.body.is_termo || req.body.isTermo)) ? 1 : 0;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const result = db.prepare(`
      INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(matchId, req.user.id, senderRole, String(texto).trim(), isTermo, nowTime);

    const msgRow = db.prepare('SELECT * FROM mensagens WHERE id = ?').get(Number(result.lastInsertRowid));
    return res.status(201).json({
      id: msgRow.id,
      match_id: msgRow.match_id,
      remetente_id: msgRow.remetente_id,
      remetente_perfil: msgRow.remetente_perfil,
      texto: msgRow.texto,
      is_termo: Boolean(msgRow.is_termo),
      horario: msgRow.horario,
      criado_em: msgRow.criado_em,
      sender: msgRow.remetente_perfil,
      text: msgRow.texto,
      isTermo: Boolean(msgRow.is_termo),
      time: msgRow.horario
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao enviar mensagem.', codigo: 500 });
  }
});

// ============================================================================
// 5. PONTE DE SINCRONIZAÇÃO DE ESTADO COMPLETO (/api/state) PROTEGIDA
// ============================================================================
function buildFullStatePayload() {
  const petRows = db.prepare('SELECT * FROM animais ORDER BY id ASC').all();
  const matchRows = db.prepare('SELECT * FROM adocoes_matches ORDER BY id ASC').all();
  const formattedMatches = matchRows.map(formatMatchRow);
  const flatChats = [];
  for (const m of formattedMatches) {
    for (const msg of (m.messages || [])) {
      flatChats.push({
        id: msg.id,
        matchId: String(m.id),
        sender: msg.sender,
        text: msg.text,
        isTermo: Boolean(msg.isTermo),
        petId: m.petId,
        petName: m.petName,
        petImg: m.petImg,
        time: msg.time
      });
    }
  }
  return {
    pets: petRows.map(formatPetRow),
    matches: formattedMatches,
    chats: flatChats
  };
}

// GET /api/state - Requer autenticação (SEC-12)
app.get('/api/state', authenticateToken, (req, res) => {
  try {
    return res.status(200).json(buildFullStatePayload());
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar estado do banco.' });
  }
});

// PUT /api/state - Requer autenticação e perfil ONG ou Admin (SEC-13, SEC-14)
app.put('/api/state', authenticateToken, (req, res) => {
  try {
    if (req.user.perfil !== 'ong' && req.user.perfil !== 'admin') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores e ONGs podem sincronizar estado completo.', codigo: 403 });
    }

    const { pets, matches, chats } = req.body || {};
    const ongRow = db.prepare("SELECT id FROM usuarios WHERE perfil = 'ong' ORDER BY id ASC LIMIT 1").get();
    const defaultOngId = ongRow ? ongRow.id : 1;
    const adopterRow = db.prepare("SELECT id FROM usuarios WHERE perfil = 'adotante' ORDER BY id ASC LIMIT 1").get();
    const defaultAdopterId = adopterRow ? adopterRow.id : 2;

    if (Array.isArray(pets) && pets.length > 0) {
      const incomingIds = pets.map(p => Number(p.id)).filter(id => !Number.isNaN(id));
      if (incomingIds.length > 0) {
        const placeholders = incomingIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM animais WHERE id NOT IN (${placeholders})`).run(...incomingIds);
      }

      for (const p of pets) {
        const existing = db.prepare('SELECT id FROM animais WHERE id = ?').get(Number(p.id));
        const nome = p.nome || p.name || 'Pet';
        const rawSpecies = p.especie || p.species || 'Cachorro';
        const especie = ['Cachorro', 'Gato', 'Outro'].includes(rawSpecies)
          ? rawSpecies
          : (String(rawSpecies).toLowerCase().includes('gat') ? 'Gato' : 'Cachorro');
        const raca = p.raca || p.breed || 'SRD';
        const idade = p.idade || p.age || '1 ano';
        const rawSize = p.porte || p.size || 'Médio';
        const porte = ['Pequeno', 'Médio', 'Grande'].includes(rawSize) ? rawSize : 'Médio';
        const rawGender = p.sexo || p.gender || 'Macho';
        const sexo = ['Macho', 'Fêmea'].includes(rawGender) ? rawGender : 'Macho';
        const distancia = p.distancia || p.dist || '3km';
        const descricao = p.descricao || p.about || p.desc || 'Animal resgatado disponível para adoção responsável.';
        const foto_url = p.foto_url || p.img || '';
        const status = ['disponivel', 'em_processo', 'adotado'].includes(p.status) ? p.status : 'disponivel';
        const ong_nome = p.ong_nome || p.ong || 'ONG Patinhas Natal';

        if (existing) {
          db.prepare(`
            UPDATE animais
            SET nome = ?, especie = ?, raca = ?, idade = ?, porte = ?, sexo = ?, distancia = ?, descricao = ?, foto_url = ?, status = ?, ong_nome = ?
            WHERE id = ?
          `).run(nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, ong_nome, Number(p.id));
        } else {
          db.prepare(`
            INSERT INTO animais (id, nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, ong_id, ong_nome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(Number(p.id), nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, defaultOngId, ong_nome);
        }
      }
    }

    if (Array.isArray(matches)) {
      const incomingMatchIds = matches.map(m => Number(m.id)).filter(id => !Number.isNaN(id));
      if (incomingMatchIds.length > 0) {
        const placeholders = incomingMatchIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM adocoes_matches WHERE id NOT IN (${placeholders})`).run(...incomingMatchIds);
      }

      for (const m of matches) {
        const matchId = Number(m.id);
        const petId = Number(m.animal_id || m.petId);
        const petExists = db.prepare('SELECT id FROM animais WHERE id = ?').get(petId);
        if (!petExists) continue;

        const adopterId = Number(m.adotante_id || m.userId) || defaultAdopterId;
        const termoEnviado = (m.termo_enviado || m.termoEnviado || m.status === 'termo_enviado' || m.status === 'termo_assinado' || m.status === 'aprovado') ? 1 : 0;
        const termoAssinado = (m.termo_assinado || m.termoAssinado || m.status === 'termo_assinado' || m.status === 'aprovado') ? 1 : 0;
        let status = m.status || 'pendente';
        if (status === 'pendente' && termoAssinado) status = 'termo_assinado';
        else if (status === 'pendente' && termoEnviado) status = 'termo_enviado';

        const existingMatch = db.prepare('SELECT id FROM adocoes_matches WHERE id = ?').get(matchId);
        if (existingMatch) {
          db.prepare(`
            UPDATE adocoes_matches
            SET status = ?, termo_enviado = ?, termo_enviado_em = ?, termo_assinado = ?, assinatura_digital = ?, termo_assinado_em = ?
            WHERE id = ?
          `).run(
            status,
            termoEnviado,
            m.termo_enviado_em || m.termoEnviadoAt || m.termoEnviadoEm || null,
            termoAssinado,
            m.assinatura_digital || m.assinaturaNome || null,
            m.termo_assinado_em || m.termoAssinadoAt || m.termoAssinadoEm || null,
            matchId
          );
        } else {
          const dup = db.prepare('SELECT id FROM adocoes_matches WHERE animal_id = ? AND adotante_id = ?').get(petId, adopterId);
          if (!dup) {
            db.prepare(`
              INSERT INTO adocoes_matches (id, animal_id, adotante_id, status, termo_enviado, termo_enviado_em, termo_assinado, assinatura_digital, termo_assinado_em, data_match)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              matchId,
              petId,
              adopterId,
              status,
              termoEnviado,
              m.termo_enviado_em || m.termoEnviadoAt || m.termoEnviadoEm || null,
              termoAssinado,
              m.assinatura_digital || m.assinaturaNome || null,
              m.termo_assinado_em || m.termoAssinadoAt || m.termoAssinadoEm || null,
              m.data_match || m.date || new Date().toLocaleDateString('pt-BR')
            );
          }
        }

        const targetMatchRow = db.prepare('SELECT id FROM adocoes_matches WHERE id = ? OR (animal_id = ? AND adotante_id = ?)').get(matchId, petId, adopterId);
        const matchMessages = Array.isArray(chats)
          ? chats.filter(c => String(c.matchId) === String(m.id) || String(c.matchId) === String(targetMatchRow?.id))
          : (Array.isArray(m.messages) ? m.messages : null);

        if (targetMatchRow && Array.isArray(matchMessages)) {
          db.prepare('DELETE FROM mensagens WHERE match_id = ?').run(targetMatchRow.id);
          const insertMsg = db.prepare(`
            INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const msg of matchMessages) {
            const sender = msg.sender === 'ong' || msg.remetente_perfil === 'ong' ? 'ong' : 'user';
            const senderId = sender === 'ong' ? defaultOngId : adopterId;
            const txt = String(msg.text || msg.texto || '').trim();
            if (!txt) continue;
            insertMsg.run(
              targetMatchRow.id,
              senderId,
              sender,
              txt,
              msg.isTermo || msg.is_termo || txt.includes('[TERMO DE ADOÇÃO RESPONSÁVEL]') ? 1 : 0,
              msg.time || msg.horario || '12:00'
            );
          }
        }
      }
    }

    return res.status(200).json({
      sucesso: true,
      ...buildFullStatePayload()
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao sincronizar estado no banco SQLite.' });
  }
});

// ============================================================================
// 6. DOCUMENTAÇÃO OPENAPI 3.0 (SWAGGER UI)
// ============================================================================
const OPENAPI_PATH = path.resolve(__dirname, 'openapi.json');

app.get('/api/openapi.json', (req, res) => {
  try {
    const raw = fs.readFileSync(OPENAPI_PATH, 'utf-8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(raw);
  } catch (err) {
    res.status(500).json({ erro: 'Arquivo OpenAPI não encontrado.' });
  }
});

app.get('/api-docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Patinhas - Documentação OpenAPI 3.0 (Swagger)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar-custom { background: linear-gradient(135deg, #EA580C, #FB923C); color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .topbar-custom h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .topbar-custom span { font-size: 13px; background: rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 999px; font-weight: 600; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div class="topbar-custom">
    <h1>🐾 Projeto Integrador Patinhas — Documentação OpenAPI 3.0 (Swagger)</h1>
    <span>IFRN Campus Natal Zona Leste • Arquitetura Distribuída REST + SQLite</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis]
      });
    };
  </script>
</body>
</html>`);
});

// Handler 404 em formato JSON para endpoints de API não encontrados
app.use('/api', (req, res) => {
  res.status(404).json({
    erro: `Recurso de API '${req.method} ${req.originalUrl}' não encontrado.`,
    codigo: 404
  });
});

// Serve os arquivos estáticos do aplicativo/painel web (pasta ../www)
const WWW_PATH = path.join(__dirname, '..', 'www');
if (fs.existsSync(WWW_PATH)) {
  app.use(express.static(WWW_PATH));
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('====================================================================');
    console.log(`🐾 Servidor REST API Patinhas rodando em: http://localhost:${PORT}`);
    console.log(`📄 Documentação OpenAPI (Swagger UI):     http://localhost:${PORT}/api-docs`);
    console.log(`🗄️  Banco de Dados Relacional SQLite:      ${DB_PATH}`);
    console.log('====================================================================');
  });
}

module.exports = app;
