CREATE TABLE IF NOT EXISTS campanha_ativa (
  id_campanha VARCHAR(24) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  PRIMARY KEY (id_campanha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
