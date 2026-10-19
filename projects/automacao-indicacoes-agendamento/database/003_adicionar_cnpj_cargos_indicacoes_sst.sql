ALTER TABLE `IndicacoesSST`
  ADD COLUMN `cnpj_cliente` VARCHAR(14) NULL AFTER `nome_cliente`,
  ADD COLUMN `cargos` TEXT NULL AFTER `quantidade_funcionarios`;
