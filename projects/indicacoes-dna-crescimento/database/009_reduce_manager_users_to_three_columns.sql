ALTER TABLE usuarios_gerenciador
  DROP PRIMARY KEY,
  DROP INDEX uq_usuarios_gerenciador_login,
  DROP INDEX idx_usuarios_gerenciador_session,
  CHANGE COLUMN login Login VARCHAR(100) NOT NULL,
  CHANGE COLUMN senha_hash senha VARCHAR(255) NOT NULL,
  DROP COLUMN Id,
  DROP COLUMN session_token_hash,
  DROP COLUMN session_expires_at,
  ADD PRIMARY KEY (Login);
