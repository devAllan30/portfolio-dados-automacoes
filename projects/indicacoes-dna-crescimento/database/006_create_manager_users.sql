CREATE TABLE IF NOT EXISTS usuarios_gerenciador (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(100) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  Ativo TINYINT(1) NOT NULL DEFAULT 1,
  tentativas_falhas INT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL,
  session_token_hash CHAR(64) NULL,
  session_expires_at DATETIME NULL,
  ultimo_login DATETIME NULL,
  data_hora_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_hora_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_usuarios_gerenciador_login (login),
  KEY idx_usuarios_gerenciador_session (session_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
