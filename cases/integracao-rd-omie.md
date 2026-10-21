# Integração de vendas do RD Station CRM com o Omie

## Contexto

Após o fechamento comercial no CRM, a operação precisava conferir o pagador,
localizar ou cadastrar o cliente no ERP e montar manualmente uma Ordem de
Serviço. O processo repetia dados já existentes, exigia conferências e podia
gerar duplicidades ou divergências entre CRM e ERP.

## Objetivo

Automatizar diariamente a passagem das vendas ganhas para o Omie, preservando
as regras financeiras, a rastreabilidade e uma fila clara para exceções.

## Solução

Foi criada uma automação Python que consulta os negócios ganhos nos funis
configurados e transforma campos do pagador, produtos, valores, parcelas e
forma de pagamento em uma OS no Omie.

O fluxo aplica controles antes de qualquer gravação:

- valida CPF/CNPJ e impede o compartilhamento de cadastro por documentos
  ausentes, inválidos ou preenchidos apenas com zeros;
- exige mapeamento explícito entre cada produto do CRM e o serviço do ERP;
- identifica brindes e não cria OS para eles;
- verifica um histórico local para não processar novamente uma venda concluída;
- respeita limites de consumo da API do Omie;
- registra sucesso ou necessidade de revisão no próprio negócio do RD;
- envia relatório diário com IDs do RD e da OS, resultados e erros.

A rotina utiliza lock de execução, logs por data, estado gravado de forma
atômica e modo de simulação. Isso permite agendamento diário sem depender de
intervenção manual nos casos normais.

## Arquitetura e tecnologias

- Python e `requests`;
- APIs REST do RD Station CRM e Omie;
- configuração por variáveis de ambiente;
- arquivos JSON para idempotência e auditoria;
- SMTP para relatório operacional;
- Agendador de Tarefas do Windows.

## Resultados

- eliminação da digitação repetida entre CRM e ERP;
- redução do risco de OS duplicada;
- tratamento seguro de dados cadastrais incompletos;
- rastreabilidade entre negociação, cliente e OS;
- separação objetiva das vendas que precisam de análise;
- visibilidade diária por e-mail sobre sucessos, brindes e falhas.

## Competências demonstradas

Integração de APIs, automação de processos, idempotência, validação de dados,
tratamento de rate limit, observabilidade, segurança de credenciais, testes e
documentação operacional.

## Código público

A versão sanitizada e configurável está em
[`projects/integracao-rd-omie`](../projects/integracao-rd-omie/). Credenciais,
IDs, caminhos, dados pessoais e mapeamentos reais não são publicados.
