// ============================================================================
// backend/database.js - Camada de Persistência em Banco de Dados Relacional (SQLite)
// ============================================================================
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'patinhas.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Inicializa a conexão com o banco relacional SQLite persistido em disco
const db = new DatabaseSync(DB_PATH);

// Ativa integridade referencial (Foreign Keys) e modo WAL para alta concorrência
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Utilitários de Criptografia de Senha (PBKDF2 / Scrypt com Salt)
function hashPassword(password) {
  const salt = 'patinhas_ifrn_salt_2026';
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const hash = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// Executa o script DDL (schema.sql) e popula dados iniciais (Seeds) se vazio
function initDatabase() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  const userCount = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;
  if (userCount === 0) {
    console.log('[DB] Populando banco de dados relacional com dados fictícios iniciais (Seed)...');

    const insertUser = db.prepare(`
      INSERT INTO usuarios (nome, cpf, telefone, email, senha_hash, perfil, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Usuário ONG Padrão (ID 1)
    const ongResult = insertUser.run(
      'ONG Patinhas Natal',
      '12.345.678/0001-90',
      '(84) 99876-5432',
      'admin@ong.com',
      hashPassword('admin'),
      'ong',
      ''
    );
    const ongId = Number(ongResult.lastInsertRowid);

    // 2. Usuários Adotantes Fictícios para Teste (ID 2 e ID 3)
    const lucasResult = insertUser.run(
      'Lucas Aprígio',
      '123.456.789-00',
      '(84) 99911-2233',
      'lucas@ifrn.edu.br',
      hashPassword('123456'),
      'adotante',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80'
    );
    const lucasId = Number(lucasResult.lastInsertRowid);

    const mariaResult = insertUser.run(
      'Maria Clara',
      '987.654.321-11',
      '(84) 98877-6655',
      'maria@email.com',
      hashPassword('123456'),
      'adotante',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80'
    );
    const mariaId = Number(mariaResult.lastInsertRowid);

    // 3. Animais Iniciais (Pets vinculados à ONG via chave estrangeira ong_id)
    const insertPet = db.prepare(`
      INSERT INTO animais (nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, ong_id, ong_nome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialPets = [
      [
        'Buddy', 'Cachorro', 'Golden Retriever', '2 anos', 'Grande', 'Macho', '5km',
        'O Buddy foi resgatado e é extremamente dócil, vacinado e castrado. Adora brincar com bolinhas e convive muito bem com crianças.',
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas'
      ],
      [
        'Luna', 'Cachorro', 'SRD (Vira-lata)', '1 ano', 'Médio', 'Fêmea', '2km',
        'Luna é uma cachorrinha carinhosa, alegre e já está vacinada e vermifugada. Procura uma família amorosa em Natal/RN.',
        'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80',
        'disponivel', ongId, 'Protetores Unidos'
      ],
      [
        'Mia', 'Gato', 'Siamês', '3 anos', 'Pequeno', 'Fêmea', '4km',
        'Mia é uma gatinha calma, castrada, acostumada com apartamento e tela de proteção.',
        'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80',
        'disponivel', ongId, 'Gatil RN'
      ],
      [
        'Thor', 'Cachorro', 'Pastor Alemão', '3 anos', 'Grande', 'Macho', '6km',
        'Thor é leal, protetor e muito obediente. Ideal para casas com quintal espaçoso.',
        'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas'
      ],
      [
        'Bella', 'Cachorro', 'Poodle', '2 anos', 'Pequeno', 'Fêmea', '3km',
        'Bella é super companheira, silenciosa e adora colo. Ótima para apartamentos.',
        'https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas'
      ],
      [
        'Zeus', 'Cachorro', 'Husky Siberiano', '2 anos', 'Grande', 'Macho', '7km',
        'Zeus é brincalhão, cheio de energia e muito sociável com outros cães.',
        'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&q=80',
        'disponivel', ongId, 'Amigos de Quatro Patas'
      ]
    ];

    for (const pet of initialPets) {
      insertPet.run(...pet);
    }

    // 4. Match Inicial de Exemplo (Thor com Lucas Aprígio - Termo Enviado)
    const insertMatch = db.prepare(`
      INSERT INTO adocoes_matches (animal_id, adotante_id, status, termo_enviado, termo_enviado_em, termo_assinado, data_match)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const matchRes = insertMatch.run(
      4, // Thor
      lucasId,
      'termo_enviado',
      1,
      new Date().toISOString(),
      0,
      new Date().toLocaleDateString('pt-BR')
    );
    const matchId = Number(matchRes.lastInsertRowid);

    // 5. Mensagens Iniciais do Match
    const insertMsg = db.prepare(`
      INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertMsg.run(
      matchId,
      ongId,
      'ong',
      'Olá, Lucas Aprígio! Ficamos muito felizes pelo seu interesse no(a) Thor! Como podemos te ajudar no processo de adoção? 🐾',
      0,
      '14:20'
    );

    insertMsg.run(
      matchId,
      lucasId,
      'user',
      'Olá! Tenho quintal amplo e muita vontade de adotar o Thor!',
      0,
      '14:22'
    );

    insertMsg.run(
      matchId,
      ongId,
      'ong',
      '📄 [TERMO DE ADOÇÃO RESPONSÁVEL]\nClique no botão abaixo para ler o contrato e realizar a assinatura digital para adoção de Thor.',
      1,
      '14:25'
    );

    console.log('[DB] Seed inicial concluído com sucesso!');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }
}

initDatabase();

module.exports = {
  db,
  DB_PATH,
  hashPassword,
  verifyPassword
};
