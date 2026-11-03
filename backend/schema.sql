-- ============================================================================
-- PROJETO PATINHAS - ESQUEMA DO BANCO DE DADOS RELACIONAL (SQLite / ANSI SQL)
-- Etapa 3 & 4: Arquitetura Distribuída, Prontuário Veterinário, Resgates e Pós-Adoção
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABELA DE USUÁRIOS (Adotantes, ONGs, Administradores e Protetores Independentes)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
    cpf TEXT UNIQUE,
    telefone TEXT,
    email TEXT NOT NULL UNIQUE CHECK(email LIKE '%_@_%.__%'),
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'adotante' CHECK(perfil IN ('adotante', 'ong', 'admin', 'protetor')),
    avatar_url TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE ANIMAIS (Pets com Histórico Clínico e Dados de Resgate)
CREATE TABLE IF NOT EXISTS animais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL CHECK(length(trim(nome)) >= 2),
    especie TEXT NOT NULL DEFAULT 'Cachorro' CHECK(especie IN ('Cachorro', 'Gato', 'Outro')),
    raca TEXT NOT NULL DEFAULT 'SRD',
    idade TEXT NOT NULL,
    porte TEXT NOT NULL DEFAULT 'Médio' CHECK(porte IN ('Pequeno', 'Médio', 'Grande')),
    sexo TEXT NOT NULL DEFAULT 'Macho' CHECK(sexo IN ('Macho', 'Fêmea')),
    distancia TEXT DEFAULT '3km',
    descricao TEXT,
    foto_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disponivel' CHECK(status IN ('resgatado', 'em_tratamento', 'disponivel', 'em_processo', 'adotado')),
    ong_id INTEGER NOT NULL,
    ong_nome TEXT NOT NULL DEFAULT 'ONG Patinhas',
    -- Campos de Resgate e Histórico Clínico Integrado
    data_resgate TEXT,
    local_resgate TEXT,
    origem_resgate TEXT DEFAULT 'rua',
    condicao_inicial TEXT,
    nascimento_estimado TEXT,
    microchip TEXT,
    castrado INTEGER NOT NULL DEFAULT 0 CHECK(castrado IN (0, 1)),
    vacinado INTEGER NOT NULL DEFAULT 0 CHECK(vacinado IN (0, 1)),
    vermifugado INTEGER NOT NULL DEFAULT 0 CHECK(vermifugado IN (0, 1)),
    peso_atual_kg REAL,
    pendencias_saude TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ong_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 3. TABELA DE ADOÇÕES / MATCHES (Fluxo de Estados da Adoção)
CREATE TABLE IF NOT EXISTS adocoes_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    adotante_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'termo_enviado', 'termo_assinado', 'aprovado', 'rejeitado')),
    termo_enviado INTEGER NOT NULL DEFAULT 0 CHECK(termo_enviado IN (0, 1)),
    termo_enviado_em DATETIME,
    termo_assinado INTEGER NOT NULL DEFAULT 0 CHECK(termo_assinado IN (0, 1)),
    assinatura_digital TEXT,
    termo_assinado_em DATETIME,
    data_match TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animais(id) ON DELETE CASCADE,
    FOREIGN KEY (adotante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE(animal_id, adotante_id)
);

-- 4. TABELA DE MENSAGENS DO CHAT (Associadas ao Match e ao Usuário Remetente)
CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    remetente_id INTEGER NOT NULL,
    remetente_perfil TEXT NOT NULL CHECK(remetente_perfil IN ('user', 'ong')),
    texto TEXT NOT NULL CHECK(length(trim(texto)) >= 1),
    is_termo INTEGER NOT NULL DEFAULT 0 CHECK(is_termo IN (0, 1)),
    horario TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES adocoes_matches(id) ON DELETE CASCADE,
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 5. TABELA DE CUSTÓDIAS (Cadeia de Responsabilidade: Resgatador -> ONG -> Lar Temporário -> Tutor)
CREATE TABLE IF NOT EXISTS custodias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    responsavel_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('resgatador', 'ong', 'lar_temporario', 'tutor')),
    inicio TEXT NOT NULL,
    fim TEXT,
    motivo_fim TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animais(id) ON DELETE CASCADE,
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 6. TABELA DE PRONTUÁRIO VETERINÁRIO & LINHA DO TEMPO (Histórico Clínico Unificado)
CREATE TABLE IF NOT EXISTS prontuario_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    custodia_id INTEGER,
    autor_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN (
        'resgate', 'triagem', 'consulta', 'exame', 'vacina',
        'vermifugo', 'castracao', 'cirurgia', 'internacao',
        'medicamento', 'peso', 'microchip', 'reabilitacao',
        'adocao', 'devolucao', 'obito', 'observacao'
    )),
    titulo TEXT NOT NULL CHECK(length(trim(titulo)) >= 2),
    descricao TEXT,
    dados_json TEXT,
    ocorrido_em TEXT NOT NULL,
    proxima_data TEXT,
    profissional TEXT,
    crmv TEXT,
    clinica TEXT,
    custo_centavos INTEGER DEFAULT 0,
    visibilidade TEXT NOT NULL DEFAULT 'publico' CHECK(visibilidade IN ('publico', 'tutor', 'interno')),
    retifica_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (animal_id) REFERENCES animais(id) ON DELETE CASCADE,
    FOREIGN KEY (custodia_id) REFERENCES custodias(id) ON DELETE SET NULL,
    FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    FOREIGN KEY (retifica_id) REFERENCES prontuario_eventos(id) ON DELETE SET NULL
);

-- 7. TABELA DE MARCOS E CONQUISTAS DO TUTOR (Engajamento Pós-Adoção)
CREATE TABLE IF NOT EXISTS marcos_tutor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id INTEGER NOT NULL,
    animal_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT '🏆',
    conquistado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (animal_id) REFERENCES animais(id) ON DELETE CASCADE
);

-- 8. TABELA DE INDICAÇÕES DE ADOÇÃO (Programa "Indique um Amigo")
CREATE TABLE IF NOT EXISTS indicacoes_adocao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id INTEGER NOT NULL,
    codigo TEXT NOT NULL UNIQUE,
    indicado_email TEXT,
    indicado_id INTEGER,
    status TEXT NOT NULL DEFAULT 'gerado' CHECK(status IN ('gerado', 'compartilhado', 'adotou')),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (indicado_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ÍNDICES PARA OTIMIZAÇÃO DE CONSULTAS E PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_animais_status ON animais(status);
CREATE INDEX IF NOT EXISTS idx_animais_ong ON animais(ong_id);
CREATE INDEX IF NOT EXISTS idx_matches_adotante ON adocoes_matches(adotante_id);
CREATE INDEX IF NOT EXISTS idx_matches_animal ON adocoes_matches(animal_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_match ON mensagens(match_id);
CREATE INDEX IF NOT EXISTS idx_custodias_animal ON custodias(animal_id);
CREATE INDEX IF NOT EXISTS idx_custodias_resp ON custodias(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_animal ON prontuario_eventos(animal_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_tipo ON prontuario_eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_prontuario_ocorrido ON prontuario_eventos(ocorrido_em);
CREATE INDEX IF NOT EXISTS idx_marcos_tutor ON marcos_tutor(tutor_id, animal_id);
CREATE INDEX IF NOT EXISTS idx_indicacoes_codigo ON indicacoes_adocao(codigo);
