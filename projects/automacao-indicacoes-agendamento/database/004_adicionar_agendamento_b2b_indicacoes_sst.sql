ALTER TABLE `indicacoessst`
  DROP INDEX `uk_indicacoes_sst_negociacao_rd`,
  ADD COLUMN `discriminator` VARCHAR(30) NULL AFTER `operacao`,
  ADD COLUMN `data_hora_reuniao` DATETIME NULL AFTER `observacao`,
  ADD COLUMN `responsavel_reuniao_id` VARCHAR(64) NULL AFTER `data_hora_reuniao`,
  ADD KEY `idx_indicacoes_sst_discriminator` (`discriminator`),
  ADD KEY `idx_indicacoes_sst_negociacao_rd` (`negociacao_rd_id`);
