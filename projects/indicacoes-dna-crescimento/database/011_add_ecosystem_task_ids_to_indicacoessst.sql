ALTER TABLE `indicacoessst`
  ADD COLUMN `tipo_Ecossistema` VARCHAR(50) NULL AFTER `operacao`,
  ADD COLUMN `id_tarefa_rd` VARCHAR(64) NULL AFTER `negociacao_rd_id`,
  ADD COLUMN `id_tarefa_google_agenda` VARCHAR(255) NULL AFTER `id_tarefa_rd`;
