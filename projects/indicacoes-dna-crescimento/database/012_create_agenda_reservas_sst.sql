CREATE TABLE IF NOT EXISTS `rd_st_qc`.`agenda_reservas_sst` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `responsavel_id` VARCHAR(64) NOT NULL,
  `data_hora` DATETIME NOT NULL,
  `origem` VARCHAR(64) NOT NULL,
  `referencia_id` BIGINT UNSIGNED NULL,
  `google_event_id` VARCHAR(255) NULL,
  `confirmada` TINYINT(1) NOT NULL DEFAULT 0,
  `expira_em` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agenda_reservas_sst_responsavel_horario` (`responsavel_id`, `data_hora`),
  KEY `idx_agenda_reservas_sst_expira_em` (`confirmada`, `expira_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
