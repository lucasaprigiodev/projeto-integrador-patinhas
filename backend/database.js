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
    console.log('[DB] Populando banco de dados relacional com dados ricos de Natal/RN (Seed)...');

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

    // 2. Usuários Adotantes para Teste e Demonstração (ID 2 e ID 3)
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
      'Maria Clara Costa',
      '987.654.321-11',
      '(84) 98877-6655',
      'maria@email.com',
      hashPassword('123456'),
      'adotante',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80'
    );
    const mariaId = Number(mariaResult.lastInsertRowid);

    // 3. Catálogo Enriquecido de 10 Animais (Cães e Gatos de Natal/RN)
    const insertPet = db.prepare(`
      INSERT INTO animais (nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status, ong_id, ong_nome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialPets = [
      [
        'Buddy', 'Cachorro', 'Golden Retriever', '2 anos', 'Grande', 'Macho', '3km • Tirol',
        'O Buddy foi resgatado e é extremamente dócil, vacinado (V10 + Antirrábica), castrado e microchipado. Adora brincar com bolinhas e convive muito bem com crianças e outros pets.',
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal'
      ],
      [
        'Luna', 'Cachorro', 'SRD (Caramelo)', '1 ano', 'Médio', 'Fêmea', '2km • Ponta Negra',
        'Luna é uma cachorrinha carinhosa, alegre e já está 100% vacinada, castrada e vermifugada. Passeia super bem na guia e procura uma família amorosa em Natal/RN.',
        'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80',
        'disponivel', ongId, 'Protetores de Ponta Negra'
      ],
      [
        'Nala', 'Gato', 'Tigrada SRD', '8 meses', 'Pequeno', 'Fêmea', '1.5km • Lagoa Nova',
        'Nala é uma gatinha jovem, super ronronante, testada FIV/FeLV negativo, castrada e acostumada a usar caixinha de areia. Ideal para apartamentos telados.',
        'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80',
        'disponivel', ongId, 'Gatil Amor Felino RN'
      ],
      [
        'Thor', 'Cachorro', 'Pastor Alemão', '3 anos', 'Grande', 'Macho', '5km • Capim Macio',
        'Thor é leal, inteligente, obediente e muito carinhoso com a família. Vacinado, castrado e vermifugado. Ideal para casas com quintal murado.',
        'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal'
      ],
      [
        'Bella', 'Cachorro', 'Poodle Toy', '2 anos', 'Pequeno', 'Fêmea', '2.5km • Petrópolis',
        'Bella é super companheira, silenciosa, hipoalergênica e adora colo. Ótima opção para apartamentos e famílias tranquilas.',
        'https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal'
      ],
      [
        'Zeus', 'Cachorro', 'Husky Siberiano', '2 anos', 'Grande', 'Macho', '6km • Candelária',
        'Zeus é brincalhão, cheio de energia e muito sociável com outros cães. Já está castrado, vacinado e microchipado.',
        'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&q=80',
        'disponivel', ongId, 'Amigos de Quatro Patas'
      ],
      [
        'Max', 'Cachorro', 'Beagle', '1 ano', 'Médio', 'Macho', '4km • Alecrim',
        'Max é um cãozinho curioso, alegre e super dócil com crianças. Vacinação e vermifugação rigorosamente em dia.',
        'https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal'
      ],
      [
        'Nina', 'Gato', 'Persa Mix', '2 anos', 'Pequeno', 'Fêmea', '3km • Cidade Jardim',
        'Nina é extremamente calma, dócil, castrada e adora cochilar no sofá. Negativa para FIV/FeLV e pronta para adoção responsável.',
        'https://images.unsplash.com/photo-1513360371669-4adf3dd7dff8?w=800&q=80',
        'disponivel', ongId, 'Gatil Amor Felino RN'
      ],
      [
        'Rocky', 'Cachorro', 'Bulldog Francês', '3 anos', 'Pequeno', 'Macho', '2km • Tirol',
        'Rocky foi resgatado de abandono, é super tranquilo, adora companhia humana e se adapta perfeitamente a apartamentos.',
        'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal'
      ],
      [
        'Mia', 'Gato', 'Siamês', '3 anos', 'Pequeno', 'Fêmea', '4km • Nova Descoberta',
        'Mia é uma gatinha carinhosa, castrada e vacinada, que já encontrou seu novo lar definitivo através do projeto Patinhas.',
        'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80',
        'adotado', ongId, 'Gatil Amor Felino RN'
      ]
    ];

    for (const pet of initialPets) {
      insertPet.run(...pet);
    }

    // 4. Processos de Adoção Iniciais cobrindo todas as fases do funil:
    const insertMatch = db.prepare(`
      INSERT INTO adocoes_matches (animal_id, adotante_id, status, termo_enviado, termo_enviado_em, termo_assinado, assinatura_digital, termo_assinado_em, data_match)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMsg = db.prepare(`
      INSERT INTO mensagens (match_id, remetente_id, remetente_perfil, texto, is_termo, horario)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const hojeStr = new Date().toLocaleDateString('pt-BR');
    const nowIso = new Date().toISOString();

    // Match 1: Thor (ID 4) com Lucas Aprígio -> Status: 'termo_enviado' (Pronto para o adotante assinar no App!)
    const m1 = insertMatch.run(4, lucasId, 'termo_enviado', 1, nowIso, 0, null, null, hojeStr);
    const m1Id = Number(m1.lastInsertRowid);
    insertMsg.run(m1Id, ongId, 'ong', 'Olá, Lucas Aprígio! Ficamos muito felizes pelo seu interesse no(a) Thor! Como podemos te ajudar no processo de adoção? 🐾', 0, '14:20');
    insertMsg.run(m1Id, lucasId, 'user', 'Olá! Moro em casa com quintal grande e murado aqui em Natal e quero muito adotar o Thor!', 0, '14:22');
    insertMsg.run(m1Id, ongId, 'ong', 'Excelente, Lucas! Disponibilizamos abaixo o Termo Oficial de Adoção Responsável para leitura e assinatura digital.', 0, '14:24');
    insertMsg.run(m1Id, ongId, 'ong', '📄 [TERMO DE ADOÇÃO RESPONSÁVEL]\nClique no botão abaixo para ler o contrato e realizar a assinatura digital para adoção de Thor.', 1, '14:25');

    // Match 2: Bella (ID 5) com Maria Clara -> Status: 'termo_assinado' (Pronto para a ONG aprovar no Painel!)
    const m2 = insertMatch.run(5, mariaId, 'termo_assinado', 1, nowIso, 1, 'Maria Clara Costa', nowIso, hojeStr);
    const m2Id = Number(m2.lastInsertRowid);
    insertMsg.run(m2Id, ongId, 'ong', 'Olá, Maria Clara! Que alegria ver seu interesse na Bella! 🐾', 0, '15:10');
    insertMsg.run(m2Id, mariaId, 'user', 'Oi! Meu apartamento é todo telado e trabalho em home office, ela terá companhia o dia inteiro.', 0, '15:12');
    insertMsg.run(m2Id, ongId, 'ong', '📄 [TERMO DE ADOÇÃO RESPONSÁVEL]\nClique no botão abaixo para ler o contrato e realizar a assinatura digital para adoção de Bella.', 1, '15:15');
    insertMsg.run(m2Id, mariaId, 'user', '✍️ Termo de Adoção Responsável assinado digitalmente com sucesso por Maria Clara Costa! Concordo com todas as cláusulas e com o período de adaptação de 7 dias.', 0, '15:18');

    // Match 3: Mia (ID 10) com Lucas Aprígio -> Status: 'aprovado' (Adoção concluída!)
    const m3 = insertMatch.run(10, lucasId, 'aprovado', 1, nowIso, 1, 'Lucas Aprígio da Silva', nowIso, hojeStr);
    const m3Id = Number(m3.lastInsertRowid);
    insertMsg.run(m3Id, ongId, 'ong', 'Olá, Lucas! Recebemos sua assinatura digital do Termo de Adoção da Mia!', 0, '10:00');
    insertMsg.run(m3Id, ongId, 'ong', '🎉 Parabéns! Sua adoção de Mia foi OFICIALMENTE APROVADA pela ONG! Seu Certificado Digital de Guarda Responsável já está ativo! 🐾❤️', 0, '10:05');

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
