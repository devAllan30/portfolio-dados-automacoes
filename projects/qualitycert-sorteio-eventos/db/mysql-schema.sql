CREATE TABLE IF NOT EXISTS Eventos_label (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome_evento VARCHAR(220) NOT NULL,
  prefixo CHAR(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  data_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_inicio DATE NULL,
  data_final DATE NULL,
  premio VARCHAR(255) NULL,
  regra_premiacao TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ganhador VARCHAR(160) NULL,
  ganhador_codigo VARCHAR(100) NULL,
  ganhador_em DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_eventos_label_nome (nome_evento),
  KEY idx_eventos_label_periodo (data_inicio, data_final),
  KEY idx_eventos_label_prefixo (prefixo),
  KEY idx_eventos_label_ativo_periodo (ativo, data_final)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Evento (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evento_id BIGINT UNSIGNED NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  tipo_interacao ENUM('sorteio', 'roleta') NOT NULL DEFAULT 'sorteio',
  codigo_sorteio VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  quantidade_certificados INT UNSIGNED NULL,
  nome VARCHAR(160) NULL,
  telefone VARCHAR(24) NULL,
  email VARCHAR(200) NULL,
  cpf CHAR(11) NULL,
  cpf_sorteio CHAR(11) GENERATED ALWAYS AS (CASE WHEN tipo_interacao = 'sorteio' THEN cpf ELSE NULL END) STORED,
  contabilidade VARCHAR(180) NULL,
  cnpj CHAR(14) NULL,
  url_origem VARCHAR(500) NULL,
  status ENUM('disponivel', 'utilizado') NOT NULL DEFAULT 'disponivel',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  preenchido_em DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_evento_codigo_composto (evento_id, codigo_sorteio),
  UNIQUE KEY idx_evento_id_cpf_sorteio_unique (evento_id, cpf_sorteio),
  KEY idx_evento_id_status (evento_id, status),
  CONSTRAINT fk_evento_label FOREIGN KEY (evento_id) REFERENCES Eventos_label (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS Usuario (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(100) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  tipo ENUM('Admin', 'User') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_usuario_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
