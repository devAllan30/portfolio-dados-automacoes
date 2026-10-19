CREATE TABLE IF NOT EXISTS consultores_indicacao (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  data_hora_cadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_consultores_indicacao_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO consultores_indicacao (nome) VALUES
  ('THALLES'),
  ('STEFANE'),
  ('PETRUS'),
  ('PATRICK'),
  ('CAMILA');
