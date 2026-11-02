-- ============================================================================
-- PROJETO PATINHAS - ESQUEMA DO BANCO DE DADOS RELACIONAL (SQLite / ANSI SQL)
-- Etapa 3: Arquitetura Distribuída, Persistência Relacional e Controle de Acesso
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABELA DE USUÁRIOS (Adotantes e ONGs)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
    cpf TEXT UNIQUE,
    telefone TEXT,
    email TEXT NOT NULL UNIQUE CHECK(email LIKE '%_@_%.__%'),
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'adotante' CHECK(perfil IN ('adotante', 'ong')),
    avatar_url TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE ANIMAIS (Pets para Adoção)
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
    status TEXT NOT NULL DEFAULT 'disponivel' CHECK(status IN ('disponivel', 'em_processo', 'adotado')),
    ong_id INTEGER NOT NULL,
    ong_nome TEXT NOT NULL DEFAULT 'ONG Patinhas',
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

-- ÍNDICES PARA OTIMIZAÇÃO DE CONSULTAS
CREATE INDEX IF NOT EXISTS idx_animais_status ON animais(status);
CREATE INDEX IF NOT EXISTS idx_matches_adotante ON adocoes_matches(adotante_id);
CREATE INDEX IF NOT EXISTS idx_matches_animal ON adocoes_matches(animal_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_match ON mensagens(match_id);
