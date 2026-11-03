// ============================================================================
// backend/database.js - Camada de Persistência em Banco de Dados Relacional (SQLite)
// Projeto Integrador Patinhas (IFRN) - Etapas 3 & 4
// Prontuário Veterinário, Resgates, Custódias e Acompanhamento Pós-Adoção
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

// Utilitários de Criptografia de Senha (Scrypt com Salt individual por usuário - OWASP compliant)
function hashPassword(password, customSalt = null) {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.includes(':')) {
    const [salt, hash] = storedHash.split(':');
    const computed = crypto.scryptSync(String(password), salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
    } catch (_) {
      return false;
    }
  }
  const legacySalt = 'patinhas_ifrn_salt_2026';
  const legacyHash = crypto.scryptSync(String(password), legacySalt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(legacyHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (_) {
    return false;
  }
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

    // 1. Usuário ONG Principal (ID 1)
    const ongResult = insertUser.run(
      'ONG Patinhas Natal',
      '12.345.678/0001-90',
      '(84) 99876-5432',
      'admin@ong.com',
      hashPassword('admin'),
      'ong',
      'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&q=80'
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

    // 4. Usuário Administrador Geral do Sistema (ID 4)
    const adminResult = insertUser.run(
      'Administrador Patinhas',
      '000.000.000-01',
      '(84) 99888-7766',
      'admin@patinhas.org.br',
      hashPassword('admin123'),
      'admin',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80'
    );
    const adminId = Number(adminResult.lastInsertRowid);

    // 5. Segunda ONG Parceira: Gatil Amor Felino RN (ID 5)
    const gatilResult = insertUser.run(
      'Gatil Amor Felino RN',
      '98.765.432/0001-10',
      '(84) 99123-4567',
      'contato@gatamor.com.br',
      hashPassword('admin'),
      'ong',
      'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=400&q=80'
    );
    const gatilId = Number(gatilResult.lastInsertRowid);

    // 6 e 7. Outros Adotantes Cadastrados
    const joaoResult = insertUser.run(
      'João Pedro Oliveira',
      '333.444.555-66',
      '(84) 98765-4321',
      'joao@email.com',
      hashPassword('123456'),
      'adotante',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80'
    );
    const joaoId = Number(joaoResult.lastInsertRowid);

    const anaResult = insertUser.run(
      'Ana Beatriz Rocha',
      '777.888.999-00',
      '(84) 99234-5678',
      'ana@email.com',
      hashPassword('123456'),
      'adotante',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80'
    );
    const anaId = Number(anaResult.lastInsertRowid);

    // 8. Protetor Independente / Resgatador Cadastrado (ID 8)
    const protetorResult = insertUser.run(
      'Carlos Resgatador',
      '555.666.777-88',
      '(84) 99444-3322',
      'carlos@protetor.org',
      hashPassword('123456'),
      'protetor',
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&q=80'
    );
    const protetorId = Number(protetorResult.lastInsertRowid);

    // 3. Catálogo Enriquecido de 15 Animais com Dados de Resgate e Saúde
    const insertPet = db.prepare(`
      INSERT INTO animais (
        nome, especie, raca, idade, porte, sexo, distancia, descricao, foto_url, status,
        ong_id, ong_nome, data_resgate, local_resgate, origem_resgate, condicao_inicial,
        nascimento_estimado, microchip, castrado, vacinado, vermifugado, peso_atual_kg, pendencias_saude
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialPets = [
      // 1. Buddy (ID 1)
      [
        'Buddy', 'Cachorro', 'Golden Retriever', '2 anos', 'Grande', 'Macho', '3km • Tirol',
        'O Buddy foi resgatado e é extremamente dócil, vacinado (V10 + Antirrábica), castrado e microchipado. Adora brincar com bolinhas e convive muito bem com crianças e outros pets.',
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2024-01-15', 'Praça Cívica, Tirol, Natal/RN', 'rua',
        'Resgatado magro, assustado e com pulgas. Sem fraturas.',
        '2022-01-10', '981098102938475', 1, 1, 1, 29.5, null
      ],
      // 2. Luna (ID 2)
      [
        'Luna', 'Cachorro', 'SRD (Caramelo)', '1 ano', 'Médio', 'Fêmea', '2km • Ponta Negra',
        'Luna é uma cachorrinha carinhosa, alegre e já está 100% vacinada, castrada e vermifugada. Passeia super bem na guia e procura uma família amorosa em Natal/RN.',
        'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2024-03-10', 'Orla de Ponta Negra, Natal/RN', 'abandono',
        'Encontrada próxima a quiosques, dócil, leve desidratação.',
        '2023-03-01', '981098102938476', 1, 1, 1, 13.5, null
      ],
      // 3. Nala (ID 3)
      [
        'Nala', 'Gato', 'Tigrada SRD', '8 meses', 'Pequeno', 'Fêmea', '1.5km • Lagoa Nova',
        'Nala é uma gatinha jovem, super ronronante, testada FIV/FeLV negativo, castrada e acostumada a usar caixinha de areia. Ideal para apartamentos telados.',
        'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80',
        'disponivel', gatilId, 'Gatil Amor Felino RN',
        '2024-04-05', 'Rua São José, Lagoa Nova, Natal/RN', 'rua',
        'Filhote resgatada em telhado, verminose leve tratada.',
        '2023-08-15', '981098102938477', 1, 1, 1, 3.2, null
      ],
      // 4. Thor (ID 4)
      [
        'Thor', 'Cachorro', 'Pastor Alemão', '3 anos', 'Grande', 'Macho', '5km • Capim Macio',
        'Thor é leal, inteligente, obediente e muito carinhoso com a família. Vacinado, castrado e vermifugado. Ideal para casas com quintal murado.',
        'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&q=80',
        'em_processo', ongId, 'ONG Patinhas Natal',
        '2023-11-20', 'Av. Engenheiro Roberto Freire, Natal/RN', 'abandono',
        'Resgatado após abandono em imóvel fechado, recuperado plenamente.',
        '2021-11-01', '981098102938478', 1, 1, 1, 34.0, null
      ],
      // 5. Bella (ID 5)
      [
        'Bella', 'Cachorro', 'Poodle Toy', '2 anos', 'Pequeno', 'Fêmea', '2.5km • Petrópolis',
        'Bella é super companheira, silenciosa, hipoalergênica e adora colo. Ótima opção para apartamentos e famílias tranquilas.',
        'https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?w=800&q=80',
        'em_processo', ongId, 'ONG Patinhas Natal',
        '2024-02-14', 'Rua Afonso Pena, Petrópolis, Natal/RN', 'entrega_voluntaria',
        'Tutor idoso faleceu; família solicitou acolhimento responsável.',
        '2022-02-01', '981098102938479', 1, 1, 1, 4.2, null
      ],
      // 6. Zeus (ID 6)
      [
        'Zeus', 'Cachorro', 'Husky Siberiano', '2 anos', 'Grande', 'Macho', '6km • Candelária',
        'Zeus é brincalhão, cheio de energia e muito sociável com outros cães. Já está castrado, vacinado e microchipado.',
        'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2023-12-05', 'Candelária, Natal/RN', 'rua',
        'Encontrado vagando em via rápida, sem identificação.',
        '2022-06-01', '981098102938480', 1, 1, 1, 25.8, null
      ],
      // 7. Max (ID 7)
      [
        'Max', 'Cachorro', 'Beagle', '1 ano', 'Médio', 'Macho', '4km • Alecrim',
        'Max é um cãozinho curioso, alegre e super dócil com crianças. Vacinação e vermifugação rigorosamente em dia.',
        'https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2024-05-18', 'Feira do Alecrim, Natal/RN', 'rua',
        'Filhote perdido, tratado contra dermatite alérgica de pulga.',
        '2023-05-01', '981098102938481', 1, 1, 1, 12.0, null
      ],
      // 8. Nina (ID 8)
      [
        'Nina', 'Gato', 'Persa Mix', '2 anos', 'Pequeno', 'Fêmea', '3km • Cidade Jardim',
        'Nina é extremamente calma, dócil, castrada e adora cochilar no sofá. Negativa para FIV/FeLV e pronta para adoção responsável.',
        'https://images.unsplash.com/photo-1513360371669-4adf3dd7dff8?w=800&q=80',
        'disponivel', gatilId, 'Gatil Amor Felino RN',
        '2024-02-28', 'Cidade Jardim, Natal/RN', 'entrega_voluntaria',
        'Entrega por motivo de mudança para o exterior; saudável.',
        '2022-02-10', '981098102938482', 1, 1, 1, 3.6, null
      ],
      // 9. Rocky (ID 9)
      [
        'Rocky', 'Cachorro', 'Bulldog Francês', '3 anos', 'Pequeno', 'Macho', '2km • Tirol',
        'Rocky foi resgatado de abandono, é super tranquilo, adora companhia humana e se adapta perfeitamente a apartamentos.',
        'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2023-09-12', 'Tirol, Natal/RN', 'abandono',
        'Resgatado de canil clandestino desativado; coluna acompanhada.',
        '2021-09-01', '981098102938483', 1, 1, 1, 11.2, 'Exige residência sem escadas'
      ],
      // 10. Mia (ID 10) - Adotada por Lucas Aprígio!
      [
        'Mia', 'Gato', 'Siamês', '3 anos', 'Pequeno', 'Fêmea', '4km • Nova Descoberta',
        'Mia é uma gatinha carinhosa, castrada e vacinada, que já encontrou seu novo lar definitivo através do projeto Patinhas.',
        'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80',
        'adotado', gatilId, 'Gatil Amor Felino RN',
        '2023-07-20', 'Nova Descoberta, Natal/RN', 'rua',
        'Resgatada filhote, sociabilizada no gatil e adotada com muito amor.',
        '2021-07-01', '981098102938484', 1, 1, 1, 3.8, null
      ],
      // 11. Pipoca (ID 11)
      [
        'Pipoca', 'Cachorro', 'Spitz Alemão', '1 ano', 'Pequeno', 'Fêmea', '1km • Ponta Negra',
        'Pipoca é pequenina, animada e muito dócil. Ideal para companhia em apartamentos. Vacinada e castrada.',
        'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2024-06-01', 'Ponta Negra, Natal/RN', 'rua',
        'Encontrada assustada em dia de chuva, pelagem recuperada.',
        '2023-06-01', '981098102938485', 1, 1, 1, 3.5, null
      ],
      // 12. Bob (ID 12)
      [
        'Bob', 'Cachorro', 'Labrador Retriever', '2 anos', 'Grande', 'Macho', '3.5km • Capim Macio',
        'Bob é amigável, adora nadar e passear ao ar livre. Ótimo com crianças e famílias ativas.',
        'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2023-10-15', 'Capim Macio, Natal/RN', 'abandono',
        'Resgatado com otite externa, totalmente curado após tratamento.',
        '2022-08-10', '981098102938486', 1, 1, 1, 31.2, null
      ],
      // 13. Simba (ID 13)
      [
        'Simba', 'Gato', 'Amarelo SRD', '1 ano', 'Pequeno', 'Macho', '2km • Tirol',
        'Simba é brincalhão, adora arranhadores e brinquedos com penas. Castrado e testado negativo para FIV/FeLV.',
        'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=800&q=80',
        'disponivel', gatilId, 'Gatil Amor Felino RN',
        '2024-01-22', 'Parque das Dunas / Tirol, Natal/RN', 'rua',
        'Resgatado de colônia monitorada, castrado e vermifugado.',
        '2023-05-15', '981098102938487', 1, 1, 1, 4.1, null
      ],
      // 14. Mel (ID 14)
      [
        'Mel', 'Cachorro', 'Cocker Spaniel', '3 anos', 'Médio', 'Fêmea', '4km • Lagoa Nova',
        'Mel tem pelagem linda e sedosa, temperamento muito tranquilo e adora carinho nas orelhas.',
        'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=800&q=80',
        'disponivel', ongId, 'ONG Patinhas Natal',
        '2024-02-05', 'Lagoa Nova, Natal/RN', 'rua',
        'Resgatada com ferimentos leves na pele, prontamente tratada.',
        '2021-12-01', '981098102938488', 1, 1, 1, 12.8, null
      ],
      // 15. Chico (ID 15)
      [
        'Chico', 'Cachorro', 'SRD Vira-lata', '2 anos', 'Médio', 'Macho', '2.8km • Petrópolis',
        'Chico é o legítimo vira-lata companheiro, esperto, resistente e muito afetuoso com quem cuida dele.',
        'https://images.unsplash.com/photo-1534361960057-19889db9621e?w=800&q=80',
        'em_processo', ongId, 'ONG Patinhas Natal',
        '2024-04-12', 'Petrópolis, Natal/RN', 'rua',
        'Resgatado de comunitário por protetor voluntário e acolhido pela ONG.',
        '2022-04-01', '981098102938489', 1, 1, 1, 16.5, null
      ]
    ];

    for (const pet of initialPets) {
      insertPet.run(...pet);
    }

    // 4. Cadeia de Custódias Iniciais
    const insertCustodia = db.prepare(`
      INSERT INTO custodias (animal_id, responsavel_id, tipo, inicio, fim, motivo_fim)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Pets 1 a 9, 11 a 15 em custódia ativa da ONG ou Gatil
    for (let pId = 1; pId <= 15; pId++) {
      if (pId === 10) continue; // Mia tem histórico especial de adoção
      const respId = [3, 8, 13].includes(pId) ? gatilId : ongId;
      insertCustodia.run(pId, respId, 'ong', '2024-01-01', null, null);
    }

    // Mia (Pet 10): Custódia 1 (Gatil) encerrada -> Custódia 2 (Lucas Aprígio) ativa como tutor!
    insertCustodia.run(10, gatilId, 'ong', '2023-07-20', '2024-09-20', 'adocao_aprovada');
    const custodiaMiaTutor = insertCustodia.run(10, lucasId, 'tutor', '2024-09-20', null, null);
    const custodiaMiaTutorId = Number(custodiaMiaTutor.lastInsertRowid);

    // 5. Prontuário Veterinário & Histórico Clínico Enriquecido (Linha do Tempo)
    const insertProntuario = db.prepare(`
      INSERT INTO prontuario_eventos (
        animal_id, custodia_id, autor_id, tipo, titulo, descricao, dados_json,
        ocorrido_em, proxima_data, profissional, crmv, clinica, custo_centavos, visibilidade
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Prontuário Buddy (ID 1)
    insertProntuario.run(
      1, 1, ongId, 'resgate', 'Resgate Realizado em Tirol',
      'Animal localizado vagando nas imediações da Praça Cívica. Dócil, desidratado e com fome. Acolhido com sucesso.',
      JSON.stringify({ local: 'Praça Cívica, Tirol', condicao: 'magro, dócil' }),
      '2024-01-15', null, 'Carlos Voluntário', null, 'ONG Patinhas', 0, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'triagem', 'Triagem Clínica Inicial',
      'Exame físico completo, ausculta cardíaca normal, mucosas coradas, peso aferido de 22.0kg. Coleta de exames.',
      JSON.stringify({ peso_kg: 22.0, temperatura: 38.6 }),
      '2024-01-16', null, 'Dra. Camila Moura', 'CRMV/RN 1855', 'Hospital Vet Natal', 15000, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'vermifugo', 'Vermifugação com Drontal Plus',
      'Administrado comprimido palatável conforme o peso.',
      JSON.stringify({ medicamento: 'Drontal Plus', dose: '2 comprimidos' }),
      '2024-01-17', '2024-07-17', 'Dra. Camila Moura', 'CRMV/RN 1855', 'Hospital Vet Natal', 4500, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'vacina', 'Vacina Polivalente V10 (1ª Dose)',
      'Vacina múltipla canina contra cinomose, parvovirose, hepatite, leptospirose e coronavirose.',
      JSON.stringify({ vacina: 'V10 Vanguard', lote: 'LT-88291A', dose: '1ml' }),
      '2024-01-25', '2024-02-15', 'Dr. Roberto Silva', 'CRMV/RN 1420', 'Clínica VetCare Natal', 9500, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'castracao', 'Cirurgia de Castração Eletiva',
      'Orquiectomia bilateral sem intercorrências anestésicas. Pós-operatório com recuperação rápida e curativo limpo.',
      JSON.stringify({ procedimento: 'Orquiectomia', anestesia: 'Inalatória' }),
      '2024-02-20', null, 'Dr. Roberto Silva', 'CRMV/RN 1420', 'Clínica VetCare Natal', 32000, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'microchip', 'Implantação de Microchip Subcutâneo',
      'Microchipagem na região dorsal interescapular padrão ISO 11784/11785.',
      JSON.stringify({ numero_chip: '981098102938475' }),
      '2024-02-20', null, 'Dr. Roberto Silva', 'CRMV/RN 1420', 'Clínica VetCare Natal', 8000, 'publico'
    );
    insertProntuario.run(
      1, 1, ongId, 'peso', 'Aferição de Peso e Evolução',
      'Evolução excelente de massa corporal e pelagem.',
      JSON.stringify({ peso_kg: 29.5, altura_cm: 58 }),
      '2024-05-10', null, 'Dra. Camila Moura', 'CRMV/RN 1855', 'ONG Patinhas Natal', 0, 'publico'
    );

    // Prontuário Luna (ID 2)
    insertProntuario.run(
      2, 2, ongId, 'resgate', 'Resgate na Orla de Ponta Negra',
      'Resgatada por banhistas e voluntários em área de quiosques.',
      JSON.stringify({ local: 'Ponta Negra' }),
      '2024-03-10', null, 'Carlos Voluntário', null, 'ONG Patinhas', 0, 'publico'
    );
    insertProntuario.run(
      2, 2, ongId, 'vacina', 'Vacinação Antirrábica + V8',
      'Imunização anual completa realizada com sucesso.',
      JSON.stringify({ vacinas: ['Antirrábica Nobivac', 'V8 Pfizer'] }),
      '2024-03-25', '2025-03-25', 'Dr. Roberto Silva', 'CRMV/RN 1420', 'Clínica VetCare Natal', 11000, 'publico'
    );
    insertProntuario.run(
      2, 2, ongId, 'castracao', 'Castração Preventiva (OSH)',
      'Ovariosalpingohisterectomia profilática sem intercorrências.',
      JSON.stringify({ procedimento: 'OSH' }),
      '2024-04-02', null, 'Dra. Camila Moura', 'CRMV/RN 1855', 'Hospital Vet Natal', 28000, 'publico'
    );

    // Prontuário Nala (ID 3)
    insertProntuario.run(
      3, 3, gatilId, 'exame', 'Teste Rápido FIV/FeLV',
      'Coleta de sangue venoso para teste rápido imunocromatográfico: NEGATIVO para FIV e NEGATIVO para FeLV.',
      JSON.stringify({ fiv: 'negativo', felv: 'negativo' }),
      '2024-04-10', null, 'Dra. Fernanda Melo', 'CRMV/RN 2105', 'Gatil Amor Felino', 12000, 'publico'
    );
    insertProntuario.run(
      3, 3, gatilId, 'vacina', 'Vacina Quádrupla Felina (V4)',
      'Imunização felina contra rinotraqueíte, calicivirose, panleucopenia e clamidiose.',
      JSON.stringify({ vacina: 'Quádrupla Felina Felocell' }),
      '2024-04-20', '2025-04-20', 'Dra. Fernanda Melo', 'CRMV/RN 2105', 'Gatil Amor Felino', 9000, 'publico'
    );

    // Prontuário Mia (ID 10) - Resgate, Adoção e Acompanhamento Pós-Adoção Vitalício!
    insertProntuario.run(
      10, null, gatilId, 'resgate', 'Resgate em Nova Descoberta',
      'Filhote encontrada em caixa com água limpa providenciada por moradores.',
      JSON.stringify({ local: 'Nova Descoberta' }),
      '2023-07-20', null, 'Equipe Gatil', null, 'Gatil Amor Felino', 0, 'publico'
    );
    insertProntuario.run(
      10, null, gatilId, 'castracao', 'Castração Pediátrica',
      'Castrada aos 6 meses pelo programa municipal de controle populacional.',
      JSON.stringify({ procedimento: 'OSH felina' }),
      '2024-01-10', null, 'Dra. Fernanda Melo', 'CRMV/RN 2105', 'Gatil Amor Felino', 18000, 'publico'
    );
    insertProntuario.run(
      10, null, gatilId, 'adocao', 'Adoção Concluída para Lucas Aprígio',
      'Processo formal de adoção responsável aprovado e termo assinado digitalmente.',
      JSON.stringify({ tutor: 'Lucas Aprígio', match_id: 3 }),
      '2024-09-20', null, 'Coordenação Gatil', null, 'Gatil Amor Felino RN', 0, 'publico'
    );
    // Eventos Pós-Adoção inseridos pelo Tutor Lucas Aprígio!
    insertProntuario.run(
      10, custodiaMiaTutorId, lucasId, 'consulta', 'Consulta de Rotina Preventiva (Novo Lar)',
      'Mia adaptou-se muito bem ao novo lar. Gatinha carinhosa, alimentando-se com ração Super Premium e bebendo bastante água na fonte.',
      JSON.stringify({ peso_kg: 3.8, adaptacao: 'excelente' }),
      '2024-10-15', '2025-04-15', 'Dr. Marcos Santos', 'CRMV/RN 1990', 'Clínica Gatos & Focinhos', 13000, 'publico'
    );
    insertProntuario.run(
      10, custodiaMiaTutorId, lucasId, 'peso', 'Pesagem Mensal do Tutor',
      'Pesagem residencial de rotina. Peso estável e saudável em 3.8kg.',
      JSON.stringify({ peso_kg: 3.8 }),
      '2024-11-01', null, 'Lucas Aprígio (Tutor)', null, 'Em casa', 0, 'publico'
    );

    // 6. Marcos do Tutor (Engajamento Pós-Adoção para Lucas Aprígio)
    const insertMarco = db.prepare(`
      INSERT INTO marcos_tutor (tutor_id, animal_id, tipo, titulo, descricao, icone)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertMarco.run(
      lucasId, 10, 'adocao_concluida', 'Boas-Vindas à Família! 🐾',
      'Formalizou a adoção responsável da Mia e garantiu a ela um lar seguro e amoroso.',
      '🏠'
    );
    insertMarco.run(
      lucasId, 10, 'primeira_consulta', 'Saúde em Primeiro Lugar 🩺',
      'Realizou a primeira consulta veterinária preventiva de check-up pós-adoção.',
      '⭐'
    );
    insertMarco.run(
      lucasId, 10, 'peso_ideal', 'Curva de Crescimento Saudável 📈',
      'Mantém a curva de peso e a rotina nutricional rigorosamente monitorada.',
      '🏆'
    );

    // 7. Indicação de Adoção ("Indique um Amigo")
    const insertIndicacao = db.prepare(`
      INSERT OR IGNORE INTO indicacoes_adocao (tutor_id, codigo, indicado_email, status)
      VALUES (?, ?, ?, ?)
    `);
    insertIndicacao.run(lucasId, 'PATINHAS-LUCAS-MIA', 'amigo.lucas@email.com', 'compartilhado');

    // 8. Processos de Adoção Iniciais cobrindo todas as fases do funil:
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
    insertMsg.run(m3Id, gatilId, 'ong', 'Olá, Lucas! Recebemos sua assinatura digital do Termo de Adoção da Mia!', 0, '10:00');
    insertMsg.run(m3Id, gatilId, 'ong', '🎉 Parabéns! Sua adoção de Mia foi OFICIALMENTE APROVADA pela ONG! Seu Certificado Digital de Guarda Responsável já está ativo! 🐾❤️', 0, '10:05');

    // Match 4: Chico (ID 15) com João Pedro -> Status: 'pendente' (Adoção iniciada)
    const m4 = insertMatch.run(15, joaoId, 'pendente', 0, null, 0, null, null, hojeStr);
    const m4Id = Number(m4.lastInsertRowid);
    insertMsg.run(m4Id, ongId, 'ong', 'Olá, João Pedro! Obrigado pelo interesse no Chico! Você já teve animais antes?', 0, '16:00');
    insertMsg.run(m4Id, joaoId, 'user', 'Olá! Sim, já tive dois cães e temos muito espaço em casa.', 0, '16:05');

    // Match 5: Rocky (ID 9) com Ana Beatriz -> Status: 'rejeitado'
    const m5 = insertMatch.run(9, anaId, 'rejeitado', 0, null, 0, null, null, hojeStr);
    const m5Id = Number(m5.lastInsertRowid);
    insertMsg.run(m5Id, ongId, 'ong', 'Olá, Ana Beatriz! Agradecemos o interesse, mas o perfil do Rocky exige casa térrea sem escadas devido ao histórico de coluna da raça.', 0, '11:00');

    console.log('[DB] Seed inicial enriquecido concluído com sucesso!');
    console.log('[DB] Usuário Admin: admin@patinhas.org.br / admin123');
    console.log('[DB] Usuário ONG:   admin@ong.com / admin');
    console.log('[DB] Protetor:      carlos@protetor.org / 123456');
    console.log('[DB] Usuários Teste: lucas@ifrn.edu.br / 123456 | maria@email.com / 123456');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }
}

initDatabase();

module.exports = {
  db,
  DB_PATH,
  hashPassword,
  verifyPassword,
  initDatabase
};
