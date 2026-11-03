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
    data_resgate: row.data_resgate || null,
    local_resgate: row.local_resgate || null,
    origem_resgate: row.origem_resgate || 'rua',
    condicao_inicial: row.condicao_inicial || null,
    nascimento_estimado: row.nascimento_estimado || null,
    microchip: row.microchip || null,
    castrado: Boolean(row.castrado),
    vacinado: Boolean(row.vacinado),
    vermifugado: Boolean(row.vermifugado),
    peso_atual_kg: row.peso_atual_kg ? Number(row.peso_atual_kg) : null,
    pendencias_saude: row.pendencias_saude || null,
    resumo_saude: {
      castrado: Boolean(row.castrado),
      vacinado: Boolean(row.vacinado),
      vermifugado: Boolean(row.vermifugado),
      microchip: row.microchip || null,
      peso_atual_kg: row.peso_atual_kg ? Number(row.peso_atual_kg) : null,
      pendencias: row.pendencias_saude || null
    },
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

// POST /api/pets - Cadastra novo animal (Exclusivo perfil ONG / Protetor / Admin)
app.post('/api/pets', authenticateToken, requireRole('ong', 'protetor', 'admin'), (req, res) => {
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
    const data_resgate = body.data_resgate || new Date().toISOString().split('T')[0];
    const local_resgate = body.local_resgate || 'Natal/RN';
    const microchip = body.microchip || null;
    const castrado = body.castrado ? 1 : 0;
    const vacinado = body.vacinado ? 1 : 0;
    const vermifugado = body.vermifugado ? 1 : 0;
    const peso_atual_kg = body.peso_atual_kg ? Number(body.peso_atual_kg) : null;

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
      INSERT INTO animais (
        nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status,
        ong_id, ong_nome, data_resgate, local_resgate, microchip, castrado, vacinado, vermifugado, peso_atual_kg
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponivel', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      String(ong_nome).trim(),
      String(data_resgate),
      String(local_resgate),
      microchip,
      castrado,
      vacinado,
      vermifugado,
      peso_atual_kg
    );

    const newPetId = Number(result.lastInsertRowid);

    // Registra custódia inicial
    const custTipo = req.user.perfil === 'protetor' ? 'resgatador' : 'ong';
    db.prepare('INSERT INTO custodias (animal_id, responsavel_id, tipo, inicio) VALUES (?, ?, ?, ?)').run(newPetId, req.user.id, custTipo, data_resgate);

    const newPet = db.prepare('SELECT * FROM animais WHERE id = ?').get(newPetId);
    return res.status(201).json(formatPetRow(newPet));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao cadastrar animal.', codigo: 500 });
  }
});

// PUT /api/pets/:id - Atualiza dados de um animal (Exclusivo ONG/Protetor dona ou Admin)
app.put('/api/pets/:id', authenticateToken, requireRole('ong', 'protetor', 'admin'), (req, res) => {
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
    if (body.status !== undefined && !['resgatado', 'em_tratamento', 'disponivel', 'em_processo', 'adotado'].includes(body.status)) {
      return res.status(400).json({ erro: 'Status inválido. Valores permitidos: resgatado, em_tratamento, disponivel, em_processo, adotado.', codigo: 400 });
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
    const microchip = body.microchip !== undefined ? body.microchip : existing.microchip;
    const castrado = body.castrado !== undefined ? (body.castrado ? 1 : 0) : existing.castrado;
    const vacinado = body.vacinado !== undefined ? (body.vacinado ? 1 : 0) : existing.vacinado;
    const vermifugado = body.vermifugado !== undefined ? (body.vermifugado ? 1 : 0) : existing.vermifugado;
    const peso_atual_kg = body.peso_atual_kg !== undefined ? (body.peso_atual_kg ? Number(body.peso_atual_kg) : null) : existing.peso_atual_kg;
    const pendencias_saude = body.pendencias_saude !== undefined ? body.pendencias_saude : existing.pendencias_saude;

    db.prepare(`
      UPDATE animais
      SET nome = ?, especie = ?, raca = ?, idade = ?, porte = ?, sexo = ?, distancia = ?, descricao = ?, foto_url = ?, status = ?,
          microchip = ?, castrado = ?, vacinado = ?, vermifugado = ?, peso_atual_kg = ?, pendencias_saude = ?
      WHERE id = ?
    `).run(nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, microchip, castrado, vacinado, vermifugado, peso_atual_kg, pendencias_saude, petId);

    const updated = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    return res.status(200).json(formatPetRow(updated));
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao atualizar animal.', codigo: 500 });
  }
});

// DELETE /api/pets/:id - Remove um animal do catálogo (Exclusivo ONG/Protetor dona ou Admin)
app.delete('/api/pets/:id', authenticateToken, requireRole('ong', 'protetor', 'admin'), (req, res) => {
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

      const nowIso = new Date().toISOString();
      const hojeData = nowIso.split('T')[0];

      // Transição de Custódia: Encerra custódia da ONG/Protetor e inicia a Tutoria do Adotante
      db.prepare(`UPDATE custodias SET fim = ?, motivo_fim = 'adocao_aprovada' WHERE animal_id = ? AND fim IS NULL`).run(hojeData, pet.id);
      const novaCustodia = db.prepare(`INSERT INTO custodias (animal_id, responsavel_id, tipo, inicio) VALUES (?, ?, 'tutor', ?)`).run(pet.id, match.adotante_id, hojeData);
      const novaCustodiaId = Number(novaCustodia.lastInsertRowid);

      // Registra evento de Adoção Oficial no Prontuário Clínico Vitalício
      db.prepare(`
        INSERT INTO prontuario_eventos (
          animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json, ocorrido_em, visibilidade
        )
        VALUES (?, ?, ?, 'adocao', 'Adoção Concluída Oficialmente', ?, ?, ?, 'publico')
      `).run(
        pet.id,
        novaCustodiaId,
        req.user.id,
        `Processo de adoção formalmente concluído. Tutela transferida para o adotante.`,
        JSON.stringify({ match_id: matchId, tutor_id: match.adotante_id }),
        hojeData
      );

      // Concede o marco inicial de boas-vindas ao novo tutor
      try {
        db.prepare(`
          INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
          VALUES (?, ?, 'adocao_concluida', 'Boas-Vindas à Família! 🐾', 'Formalizou a adoção responsável e garantiu um lar seguro e amoroso.', '🏠')
        `).run(match.adotante_id, pet.id);
      } catch (_) {}

      // Gera código de indicação "Indique um Amigo"
      try {
        const codIndicacao = `PATINHAS-${match.adotante_id}-${pet.id}-${Math.floor(1000 + Math.random() * 9000)}`;
        db.prepare(`INSERT OR IGNORE INTO indicacoes_adocao (tutor_id, codigo, status) VALUES (?, ?, 'gerado')`).run(match.adotante_id, codIndicacao);
      } catch (_) {}

      db.prepare(`
        INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
        VALUES (?, ?, 'ong', ?, 0, ?)
      `).run(
        matchId,
        req.user.id,
        `🎉 Parabéns! Sua adoção de ${pet.nome} foi OFICIALMENTE APROVADA pela ONG! Seu Certificado Digital de Guarda Responsável já está ativo! 🐾❤️`,
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
// 5. MÓDULO DE RESGATES, PRONTUÁRIO VETERINÁRIO E PÓS-ADOÇÃO VITALÍCIO
// ============================================================================

// POST /api/resgates - Cadastro unificado de resgate (ONG / Protetor / Admin)
app.post('/api/resgates', authenticateToken, requireRole('ong', 'protetor', 'admin'), (req, res) => {
  try {
    const body = req.body || {};
    const nome = body.nome || body.name;
    const especie = body.especie || 'Cachorro';
    const raca = body.raca || body.breed || 'SRD';
    const idade = body.idade || body.age || 'Idade estimada';
    const porte = body.porte || body.size || 'Médio';
    const sexo = body.sexo || body.gender || 'Macho';
    const distancia = body.distancia || body.dist || '1km • Natal/RN';
    const descricao = body.descricao || body.desc || 'Animal resgatado, em acolhimento e cuidados veterinários.';
    const foto_url = body.foto_url || body.img || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80';
    const data_resgate = body.data_resgate || new Date().toISOString().split('T')[0];
    const local_resgate = body.local_resgate || 'Natal/RN';
    const origem_resgate = body.origem_resgate || 'rua';
    const condicao_inicial = body.condicao_inicial || 'Resgatado em via pública necessitando de avaliação clínica.';
    const microchip = body.microchip || null;
    const castrado = body.castrado ? 1 : 0;
    const vacinado = body.vacinado ? 1 : 0;
    const vermifugado = body.vermifugado ? 1 : 0;
    const peso_atual_kg = body.peso_atual_kg ? Number(body.peso_atual_kg) : null;
    const status_inicial = ['resgatado', 'em_tratamento', 'disponivel'].includes(body.status) ? body.status : 'resgatado';
    const ong_nome = req.user.perfil === 'ong' ? req.user.nome : (body.ong_nome || `Protetor ${req.user.nome}`);

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ erro: 'O campo "nome" é obrigatório e deve ter no mínimo 2 caracteres.', codigo: 400 });
    }
    if (!isValidImageUrl(foto_url)) {
      return res.status(400).json({ erro: 'O campo "foto_url" deve ser uma URL válida de imagem.', codigo: 400 });
    }

    const validSpecies = ['Cachorro', 'Gato', 'Outro'];
    const finalSpecies = validSpecies.includes(especie) ? especie : 'Cachorro';
    const validSizes = ['Pequeno', 'Médio', 'Grande'];
    const finalSize = validSizes.includes(porte) ? porte : 'Médio';
    const validGenders = ['Macho', 'Fêmea'];
    const finalGender = validGenders.includes(sexo) ? sexo : 'Macho';

    const insertPet = db.prepare(`
      INSERT INTO animais (
        nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status,
        ong_id, ong_nome, data_resgate, local_resgate, origem_resgate, condicao_inicial,
        microchip, castrado, vacinado, vermifugado, peso_atual_kg, pendencias_saude
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertPet.run(
      String(nome).trim(),
      finalSpecies,
      String(raca).trim(),
      String(idade).trim(),
      finalSize,
      finalGender,
      String(distancia).trim(),
      String(descricao).trim(),
      String(foto_url).trim(),
      status_inicial,
      req.user.id,
      String(ong_nome).trim(),
      String(data_resgate),
      String(local_resgate),
      String(origem_resgate),
      String(condicao_inicial),
      microchip ? String(microchip) : null,
      castrado,
      vacinado,
      vermifugado,
      peso_atual_kg,
      body.pendencias_saude || null
    );

    const petId = Number(result.lastInsertRowid);

    // 1ª Custódia: responsabilidade inicial atribuída ao usuário criador
    const custodiaTipo = req.user.perfil === 'protetor' ? 'resgatador' : 'ong';
    const custodiaResult = db.prepare(`
      INSERT INTO custodias (animal_id, responsavel_id, tipo, inicio)
      VALUES (?, ?, ?, ?)
    `).run(petId, req.user.id, custodiaTipo, data_resgate);
    const custodiaId = Number(custodiaResult.lastInsertRowid);

    // 1º Evento de Prontuário: Registro de Resgate
    db.prepare(`
      INSERT INTO prontuario_eventos (
        animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json, ocorrido_em, visibilidade
      )
      VALUES (?, ?, ?, 'resgate', 'Resgate Registrado no Sistema', ?, ?, ?, 'publico')
    `).run(
      petId,
      custodiaId,
      req.user.id,
      `Animal resgatado em ${local_resgate}. Condição inicial: ${condicao_inicial}`,
      JSON.stringify({ local: local_resgate, origem: origem_resgate, condicao: condicao_inicial }),
      data_resgate
    );

    // Se forneceu peso, registra o evento clínico
    if (peso_atual_kg) {
      db.prepare(`
        INSERT INTO prontuario_eventos (animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json, ocorrido_em, visibilidade)
        VALUES (?, ?, ?, 'peso', 'Pesagem na Entrada / Triagem', ?, ?, ?, 'publico')
      `).run(petId, custodiaId, req.user.id, `Peso inicial aferido: ${peso_atual_kg} kg`, JSON.stringify({ peso_kg: peso_atual_kg }), data_resgate);
    }

    const createdPet = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    return res.status(201).json({
      mensagem: 'Resgate registrado com sucesso e prontuário inicial criado!',
      animal: formatPetRow(createdPet),
      custodia_id: custodiaId
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao registrar resgate.', codigo: 500 });
  }
});

// POST /api/pets/:id/publicar - Disponibiliza animal para adoção após triagem (ONG / Protetor / Admin)
app.post('/api/pets/:id/publicar', authenticateToken, requireRole('ong', 'protetor', 'admin'), (req, res) => {
  try {
    const petId = Number(req.params.id);
    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    if (!pet) return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });

    if (req.user.perfil !== 'admin' && pet.ong_id !== req.user.id) {
      return res.status(403).json({ erro: 'Acesso negado. Você só pode publicar animais sob sua gestão.', codigo: 403 });
    }

    const pendencias = [];
    if (!pet.castrado) pendencias.push('Castração pendente');
    if (!pet.vacinado) pendencias.push('Vacinação pendente');
    if (!pet.vermifugado) pendencias.push('Vermifugação pendente');

    const pendenciasTexto = (req.body && req.body.pendencias_saude)
      ? req.body.pendencias_saude
      : (pendencias.length > 0 ? pendencias.join('; ') : null);

    db.prepare("UPDATE animais SET status = 'disponivel', pendencias_saude = ? WHERE id = ?").run(pendenciasTexto, petId);

    const updated = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    return res.status(200).json({
      mensagem: 'Animal disponibilizado para adoção responsável!',
      checklist: {
        castrado: Boolean(updated.castrado),
        vacinado: Boolean(updated.vacinado),
        vermifugado: Boolean(updated.vermifugado),
        pendencias_saude: updated.pendencias_saude
      },
      animal: formatPetRow(updated)
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao publicar animal para adoção.', codigo: 500 });
  }
});

// GET /api/pets/:id/prontuario - Linha do tempo clínica e de resgate unificada (Transparência Completa)
app.get('/api/pets/:id/prontuario', (req, res) => {
  try {
    const petId = Number(req.params.id);
    if (Number.isNaN(petId)) return res.status(400).json({ erro: 'ID do animal inválido.', codigo: 400 });

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    if (!pet) return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = token ? verifyToken(token) : null;

    const isManager = user && (user.perfil === 'admin' || user.id === pet.ong_id);
    const isTutor = user && Boolean(db.prepare("SELECT id FROM adocoes_matches WHERE animal_id = ? AND adotante_id = ? AND status = 'aprovado'").get(petId, user.id));

    let sql = 'SELECT p.*, u.nome as autor_nome, u.perfil as autor_perfil FROM prontuario_eventos p JOIN usuarios u ON p.autor_id = u.id WHERE p.animal_id = ?';
    if (!isManager && !isTutor) {
      sql += " AND p.visibilidade = 'publico'";
    }
    sql += ' ORDER BY p.ocorrido_em DESC, p.id DESC';

    const events = db.prepare(sql).all(petId).map(e => ({
      id: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      descricao: e.descricao,
      dados: e.dados_json ? (function() { try { return JSON.parse(e.dados_json); } catch(_) { return e.dados_json; } })() : null,
      ocorrido_em: e.ocorrido_em,
      proxima_data: e.proxima_data,
      profissional: e.profissional,
      crmv: e.crmv,
      clinica: e.clinica,
      custo_centavos: (isManager) ? e.custo_centavos : undefined,
      visibilidade: e.visibilidade,
      retifica_id: e.retifica_id,
      autor: { id: e.autor_id, nome: e.autor_nome, perfil: e.autor_perfil },
      criado_em: e.criado_em
    }));

    const custodias = db.prepare(`
      SELECT c.*, u.nome as responsavel_nome, u.perfil as responsavel_perfil
      FROM custodias c
      JOIN usuarios u ON c.responsavel_id = u.id
      WHERE c.animal_id = ?
      ORDER BY c.inicio ASC
    `).all(petId);

    return res.status(200).json({
      animal: {
        id: pet.id,
        nome: pet.nome,
        status: pet.status,
        foto_url: pet.foto_url,
        microchip: pet.microchip,
        castrado: Boolean(pet.castrado),
        vacinado: Boolean(pet.vacinado),
        vermifugado: Boolean(pet.vermifugado),
        peso_atual_kg: pet.peso_atual_kg ? Number(pet.peso_atual_kg) : null,
        pendencias_saude: pet.pendencias_saude
      },
      total_eventos: events.length,
      eventos: events,
      custodias: custodias.map(c => ({
        id: c.id,
        tipo: c.tipo,
        responsavel: { id: c.responsavel_id, nome: c.responsavel_nome, perfil: c.responsavel_perfil },
        inicio: c.inicio,
        fim: c.fim,
        motivo_fim: c.motivo_fim
      }))
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar prontuário do animal.', codigo: 500 });
  }
});

// POST /api/pets/:id/prontuario - Adiciona novo evento clínico / de cuidado (ONG, Protetor, Admin ou Tutor)
app.post('/api/pets/:id/prontuario', authenticateToken, (req, res) => {
  try {
    const petId = Number(req.params.id);
    if (Number.isNaN(petId)) return res.status(400).json({ erro: 'ID do animal inválido.', codigo: 400 });

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    if (!pet) return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });

    const isManager = req.user.perfil === 'admin' || pet.ong_id === req.user.id;
    const isTutor = Boolean(db.prepare("SELECT id FROM adocoes_matches WHERE animal_id = ? AND adotante_id = ? AND status = 'aprovado'").get(petId, req.user.id));

    if (!isManager && !isTutor) {
      return res.status(403).json({
        erro: 'Acesso negado. Apenas os gestores responsáveis (ONG/Protetor) ou o Tutor oficial do animal podem adicionar eventos ao prontuário.',
        codigo: 403
      });
    }

    const body = req.body || {};
    const validTipos = [
      'resgate', 'triagem', 'consulta', 'exame', 'vacina',
      'vermifugo', 'castracao', 'cirurgia', 'internacao',
      'medicamento', 'peso', 'microchip', 'reabilitacao',
      'adocao', 'devolucao', 'obito', 'observacao'
    ];

    if (!body.tipo || !validTipos.includes(body.tipo)) {
      return res.status(400).json({ erro: `Tipo de evento inválido. Valores válidos: ${validTipos.join(', ')}.`, codigo: 400 });
    }

    if (!body.titulo || String(body.titulo).trim().length < 2) {
      return res.status(400).json({ erro: 'O campo "titulo" é obrigatório e deve ter no mínimo 2 caracteres.', codigo: 400 });
    }

    const ocorrido_em = body.ocorrido_em || new Date().toISOString().split('T')[0];
    const proxima_data = body.proxima_data || null;
    const profissional = body.profissional || null;
    const crmv = body.crmv || null;
    const clinica = body.clinica || null;
    const custo_centavos = Number.isInteger(body.custo_centavos) ? body.custo_centavos : 0;
    const visibilidade = ['publico', 'tutor', 'interno'].includes(body.visibilidade) ? body.visibilidade : 'publico';

    let dados_json = null;
    if (body.dados) {
      dados_json = typeof body.dados === 'object' ? JSON.stringify(body.dados) : String(body.dados);
    } else if (body.dados_json) {
      dados_json = typeof body.dados_json === 'object' ? JSON.stringify(body.dados_json) : String(body.dados_json);
    }

    const activeCustodia = db.prepare('SELECT id FROM custodias WHERE animal_id = ? AND fim IS NULL').get(petId);
    const custodiaId = activeCustodia ? activeCustodia.id : null;

    const insertStmt = db.prepare(`
      INSERT INTO prontuario_eventos (
        animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json,
        ocorrido_em, proxima_data, profissional, crmv, clinica, custo_centavos, visibilidade
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      petId, custodiaId, req.user.id, body.tipo, String(body.titulo).trim(),
      body.descricao ? String(body.descricao).trim() : null,
      dados_json, ocorrido_em, proxima_data, profissional, crmv, clinica, custo_centavos, visibilidade
    );

    const eventoId = Number(result.lastInsertRowid);

    // Efeitos colaterais clínicos em animais
    if (body.tipo === 'castracao') {
      db.prepare('UPDATE animais SET castrado = 1 WHERE id = ?').run(petId);
    } else if (body.tipo === 'vacina') {
      db.prepare('UPDATE animais SET vacinado = 1 WHERE id = ?').run(petId);
    } else if (body.tipo === 'vermifugo') {
      db.prepare('UPDATE animais SET vermifugado = 1 WHERE id = ?').run(petId);
    } else if (body.tipo === 'microchip') {
      const chipNo = (body.dados && (body.dados.numero_chip || body.dados.microchip)) || body.descricao;
      if (chipNo) db.prepare('UPDATE animais SET microchip = ? WHERE id = ?').run(String(chipNo), petId);
    } else if (body.tipo === 'peso') {
      const pesoVal = (body.dados && body.dados.peso_kg) || parseFloat(body.descricao);
      if (pesoVal && !isNaN(pesoVal)) {
        db.prepare('UPDATE animais SET peso_atual_kg = ? WHERE id = ?').run(Number(pesoVal), petId);
      }
    }

    // Se o autor for o tutor e for vacina ou peso, confere marcos automáticos se ainda não tiver
    if (isTutor) {
      if (body.tipo === 'vacina') {
        const hasMarco = db.prepare("SELECT id FROM marcos_tutor WHERE tutor_id = ? AND animal_id = ? AND tipo = 'primeira_vacina'").get(req.user.id, petId);
        if (!hasMarco) {
          db.prepare(`
            INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
            VALUES (?, ?, 'primeira_vacina', 'Imunização Garantida! 💉', 'Registrou vacina pós-adoção mantendo seu companheiro protegido.', '🛡️')
          `).run(req.user.id, petId);
        }
      } else if (body.tipo === 'peso') {
        const hasMarco = db.prepare("SELECT id FROM marcos_tutor WHERE tutor_id = ? AND animal_id = ? AND tipo = 'peso_ideal'").get(req.user.id, petId);
        if (!hasMarco) {
          db.prepare(`
            INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
            VALUES (?, ?, 'peso_ideal', 'Curva de Crescimento Saudável 📈', 'Acompanhando o peso e nutrição do pet regularmente no app.', '🏆')
          `).run(req.user.id, petId);
        }
      }
    }

    const created = db.prepare('SELECT * FROM prontuario_eventos WHERE id = ?').get(eventoId);
    return res.status(201).json({
      mensagem: 'Evento clínico adicionado com sucesso ao prontuário!',
      evento: created
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno ao adicionar evento de prontuário.', codigo: 500 });
  }
});

// POST /api/pets/:id/prontuario/:eventoId/retificar - Retificação append-only auditável
app.post('/api/pets/:id/prontuario/:eventoId/retificar', authenticateToken, (req, res) => {
  try {
    const petId = Number(req.params.id);
    const eventoId = Number(req.params.eventoId);
    const original = db.prepare('SELECT * FROM prontuario_eventos WHERE id = ? AND animal_id = ?').get(eventoId, petId);
    if (!original) return res.status(404).json({ erro: 'Evento clínico original não encontrado.', codigo: 404 });

    const pet = db.prepare('SELECT * FROM animais WHERE id = ?').get(petId);
    const isManager = req.user.perfil === 'admin' || (pet && pet.ong_id === req.user.id);
    const isAuthor = original.autor_id === req.user.id;
    if (!isManager && !isAuthor) {
      return res.status(403).json({ erro: 'Acesso negado. Apenas o autor do registro ou gestor responsável pode retificar.', codigo: 403 });
    }

    const { motivo_retificacao, titulo, descricao, dados } = req.body || {};
    if (!motivo_retificacao) {
      return res.status(400).json({ erro: 'O campo "motivo_retificacao" é obrigatório para registrar a retificação auditável.', codigo: 400 });
    }

    const insertStmt = db.prepare(`
      INSERT INTO prontuario_eventos (
        animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json,
        ocorrido_em, profissional, crmv, clinica, custo_centavos, visibilidade, retifica_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      petId,
      original.custodia_id,
      req.user.id,
      original.tipo,
      titulo ? `[RETIFICAÇÃO] ${titulo}` : `[RETIFICAÇÃO] ${original.titulo}`,
      descricao ? `${descricao} (Motivo: ${motivo_retificacao})` : `${original.descricao} (Retificado: ${motivo_retificacao})`,
      dados ? JSON.stringify(dados) : original.dados_json,
      new Date().toISOString().split('T')[0],
      original.profissional,
      original.crmv,
      original.clinica,
      original.custo_centavos,
      original.visibilidade,
      eventoId
    );

    return res.status(201).json({
      mensagem: 'Retificação registrada como novo evento auditado com sucesso!',
      evento_retificador_id: Number(result.lastInsertRowid),
      evento_original_id: eventoId
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao processar retificação.', codigo: 500 });
  }
});

// GET /api/pets/:id/agenda - Agenda de vacinas, retornos e cuidados preventivos do animal
app.get('/api/pets/:id/agenda', (req, res) => {
  try {
    const petId = Number(req.params.id);
    const pet = db.prepare('SELECT id, nome, especie, foto_url FROM animais WHERE id = ?').get(petId);
    if (!pet) return res.status(404).json({ erro: 'Animal não encontrado.', codigo: 404 });

    const hoje = new Date().toISOString().split('T')[0];
    const itens = db.prepare(`
      SELECT id, tipo, titulo, proxima_data, profissional, clinica
      FROM prontuario_eventos
      WHERE animal_id = ? AND proxima_data IS NOT NULL AND proxima_data >= ?
      ORDER BY proxima_data ASC
    `).all(petId, hoje);

    return res.status(200).json({
      animal: pet,
      total_pendentes: itens.length,
      agenda: itens.map(i => ({
        id: i.id,
        tipo: i.tipo,
        titulo: i.titulo,
        data_prevista: i.proxima_data,
        profissional: i.profissional,
        clinica: i.clinica
      }))
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao consultar agenda do animal.', codigo: 500 });
  }
});

// GET /api/meus-pets - Portal do Tutor: Animais adotados com RG Pet, curva de crescimento e saúde
app.get('/api/meus-pets', authenticateToken, (req, res) => {
  try {
    const matchesAprovados = db.prepare(`
      SELECT m.id as match_id, m.animal_id, m.termo_assinado_em, m.data_match, a.*
      FROM adocoes_matches m
      JOIN animais a ON m.animal_id = a.id
      WHERE m.adotante_id = ? AND m.status = 'aprovado'
      ORDER BY m.id DESC
    `).all(req.user.id);

    const meusPets = matchesAprovados.map(p => {
      const hoje = new Date().toISOString().split('T')[0];
      const proxVacina = db.prepare(`
        SELECT titulo, proxima_data
        FROM prontuario_eventos
        WHERE animal_id = ? AND tipo = 'vacina' AND proxima_data >= ?
        ORDER BY proxima_data ASC
        LIMIT 1
      `).get(p.animal_id, hoje);

      const marcos = db.prepare(`
        SELECT id, tipo, titulo, descricao, icone, conquistado_em
        FROM marcos_tutor
        WHERE tutor_id = ? AND animal_id = ?
        ORDER BY id ASC
      `).all(req.user.id, p.animal_id);

      const indicacao = db.prepare('SELECT codigo FROM indicacoes_adocao WHERE tutor_id = ? LIMIT 1').get(req.user.id);

      const dataInicio = p.termo_assinado_em ? new Date(p.termo_assinado_em) : new Date(p.criado_em);
      const diasJuntos = Math.max(1, Math.floor((Date.now() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        id: p.animal_id,
        nome: p.nome,
        especie: p.especie,
        raca: p.raca,
        idade: p.idade,
        porte: p.porte,
        sexo: p.sexo,
        foto_url: p.foto_url,
        status: p.status,
        peso_atual_kg: p.peso_atual_kg ? Number(p.peso_atual_kg) : null,
        castrado: Boolean(p.castrado),
        vacinado: Boolean(p.vacinado),
        microchip: p.microchip,
        dias_juntos: diasJuntos,
        rg_pet: {
          numero_registro: `RN-${String(p.animal_id).padStart(5, '0')}-${new Date().getFullYear()}`,
          microchip: p.microchip || 'Não microchipado',
          tutor_nome: req.user.nome,
          tutor_cpf: req.user.cpf || 'Cadastrado no App',
          emissao: p.termo_assinado_em || p.criado_em,
          orgao_emissor: 'Registro Digital Patinhas RN'
        },
        proxima_vacina: proxVacina ? { nome: proxVacina.titulo, data: proxVacina.proxima_data } : null,
        marcos: marcos,
        codigo_indicacao: indicacao ? indicacao.codigo : null
      };
    });

    return res.status(200).json(meusPets);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao consultar pets do tutor.', codigo: 500 });
  }
});

// POST /api/meus-pets/:id/acompanhamento - Atualização simples e vitalícia pelo Tutor (peso, vacina, consulta)
app.post('/api/meus-pets/:id/acompanhamento', authenticateToken, (req, res) => {
  try {
    const petId = Number(req.params.id);
    const isTutor = Boolean(db.prepare("SELECT id FROM adocoes_matches WHERE animal_id = ? AND adotante_id = ? AND status = 'aprovado'").get(petId, req.user.id));
    if (!isTutor && req.user.perfil !== 'admin') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas o tutor adotante oficial pode registrar acompanhamento nesta rota.', codigo: 403 });
    }

    const { tipo, peso_kg, vacina_nome, data, proxima_dose, veterinario, clinica, observacao } = req.body || {};
    const dataEvento = data || new Date().toISOString().split('T')[0];

    const activeCustodia = db.prepare('SELECT id FROM custodias WHERE animal_id = ? AND fim IS NULL').get(petId);
    const custodiaId = activeCustodia ? activeCustodia.id : null;

    let titulo = 'Atualização de Rotina';
    let tipoEvento = 'observacao';
    let dadosJson = {};

    if (tipo === 'peso' || peso_kg) {
      tipoEvento = 'peso';
      titulo = `Registro de Peso: ${peso_kg} kg`;
      dadosJson = { peso_kg: Number(peso_kg) };
      db.prepare('UPDATE animais SET peso_atual_kg = ? WHERE id = ?').run(Number(peso_kg), petId);

      const hasMarco = db.prepare("SELECT id FROM marcos_tutor WHERE tutor_id = ? AND animal_id = ? AND tipo = 'peso_ideal'").get(req.user.id, petId);
      if (!hasMarco) {
        db.prepare(`
          INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
          VALUES (?, ?, 'peso_ideal', 'Curva de Crescimento Saudável 📈', 'Acompanhando o peso e nutrição do pet regularmente no app.', '🏆')
        `).run(req.user.id, petId);
      }
    } else if (tipo === 'vacina' || vacina_nome) {
      tipoEvento = 'vacina';
      titulo = vacina_nome ? `Vacina: ${vacina_nome}` : 'Vacina Aplicada';
      dadosJson = { vacina: vacina_nome, proxima_dose };
      db.prepare('UPDATE animais SET vacinado = 1 WHERE id = ?').run(petId);

      const hasMarco = db.prepare("SELECT id FROM marcos_tutor WHERE tutor_id = ? AND animal_id = ? AND tipo = 'primeira_vacina'").get(req.user.id, petId);
      if (!hasMarco) {
        db.prepare(`
          INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
          VALUES (?, ?, 'primeira_vacina', 'Imunização Garantida! 💉', 'Registrou vacina pós-adoção mantendo seu companheiro protegido.', '🛡️')
        `).run(req.user.id, petId);
      }
    } else if (tipo === 'consulta') {
      tipoEvento = 'consulta';
      titulo = 'Consulta Veterinária de Rotina';
      dadosJson = { veterinario, clinica, retorno: proxima_dose };
    }

    const insertEvent = db.prepare(`
      INSERT INTO prontuario_eventos (
        animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json,
        ocorrido_em, proxima_data, profissional, clinica, visibilidade
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publico')
    `);

    const result = insertEvent.run(
      petId, custodiaId, req.user.id, tipoEvento, titulo,
      observacao || `Acompanhamento pós-adoção registrado pelo tutor ${req.user.nome}`,
      JSON.stringify(dadosJson),
      dataEvento,
      proxima_dose || null,
      veterinario || null,
      clinica || null
    );

    return res.status(201).json({
      mensagem: 'Acompanhamento registrado com sucesso!',
      evento_id: Number(result.lastInsertRowid)
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao registrar acompanhamento.', codigo: 500 });
  }
});

// GET /api/tutor/marcos - Lista marcos e conquistas do tutor
app.get('/api/tutor/marcos', authenticateToken, (req, res) => {
  try {
    const marcos = db.prepare(`
      SELECT m.*, a.nome as animal_nome, a.foto_url as animal_foto
      FROM marcos_tutor m
      JOIN animais a ON m.animal_id = a.id
      WHERE m.tutor_id = ?
      ORDER BY m.id DESC
    `).all(req.user.id);

    return res.status(200).json({
      total_conquistas: marcos.length,
      marcos: marcos
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar conquistas.', codigo: 500 });
  }
});

// GET /api/tutor/indicacao - Programa "Indique um Amigo"
app.get('/api/tutor/indicacao', authenticateToken, (req, res) => {
  try {
    let indicacao = db.prepare('SELECT * FROM indicacoes_adocao WHERE tutor_id = ? LIMIT 1').get(req.user.id);
    if (!indicacao) {
      const codigo = `PATINHAS-${req.user.id}-${Math.floor(1000 + Math.random() * 9000)}`;
      db.prepare("INSERT INTO indicacoes_adocao (tutor_id, codigo, status) VALUES (?, ?, 'gerado')").run(req.user.id, codigo);
      indicacao = db.prepare('SELECT * FROM indicacoes_adocao WHERE tutor_id = ? LIMIT 1').get(req.user.id);
    }

    return res.status(200).json({
      codigo: indicacao.codigo,
      link_compartilhamento: `https://lucasaprigio.github.io/projeto-integrador-patinhas/?ref=${indicacao.codigo}`,
      mensagem_pronta: `Oi! Adotei meu pet com todo amor e acompanhamento de saúde no App Patinhas. Use meu código de indicação ${indicacao.codigo} para encontrar seu novo melhor amigo: https://lucasaprigio.github.io/projeto-integrador-patinhas/?ref=${indicacao.codigo} 🐾❤️`,
      status: indicacao.status
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao consultar código de indicação.', codigo: 500 });
  }
});

// ============================================================================
// 6. PONTE DE SINCRONIZAÇÃO DE ESTADO COMPLETO (/api/state) PROTEGIDA
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
