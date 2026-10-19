# Automação de Indicações e Agendamento Comercial

## Contexto

O processo de indicação dependia de formulários com pouco controle sobre as
regras de negócio. Depois do envio, a equipe ainda precisava cadastrar ou
atualizar empresas, contatos e negociações no CRM, distribuir responsáveis e
organizar reuniões manualmente.

Além do retrabalho, esse cenário aumentava o risco de duplicidades, horários
conflitantes, divergência entre sistemas e perda de rastreabilidade.

## Objetivos

- substituir o formulário limitado por uma aplicação controlada pela empresa;
- automatizar o cadastro e a atualização de registros no CRM;
- centralizar o histórico das indicações em banco de dados;
- consultar a disponibilidade real da equipe antes do agendamento;
- distribuir reuniões de maneira equilibrada;
- manter CRM, banco de dados e Google Agenda sincronizados.

## Solução

Foi desenvolvida uma aplicação web com dois fluxos integrados:

### Indicações B2C

- cadastro do contato e de uma ou mais empresas do mesmo grupo;
- criação de uma negociação para cada empresa;
- vínculo do mesmo contato em todas as negociações;
- distribuição de todas as negociações da indicação para o mesmo responsável;
- registro das empresas relacionadas nas anotações do CRM.

### Agendamentos B2B

- consulta dos usuários elegíveis diretamente no CRM;
- leitura da disponibilidade das agendas pelo Google Calendar;
- exibição apenas dos horários que possuem pelo menos um responsável livre;
- distribuição equilibrada entre os profissionais disponíveis;
- criação ou atualização da negociação no CRM;
- criação simultânea da tarefa comercial e do evento no Google Agenda;
- geração automática do Google Meet;
- convite do contato, dos participantes adicionais e do bot de transcrição;
- configuração de acesso ao Meet sem necessidade de aprovação manual.

O fluxo grava o histórico no banco de dados, apresenta mensagens específicas
para conflitos encontrados no CRM e utiliza compensação transacional: quando
uma etapa crítica falha, os registros externos já criados são desfeitos sempre
que possível para evitar inconsistências.

## Arquitetura e tecnologias

- TypeScript, React e Node.js;
- APIs REST do RD Station CRM;
- Google Calendar API e Google Meet REST API;
- OAuth 2.0 e conta de serviço com delegação controlada;
- MySQL para histórico, rastreabilidade e controle da distribuição;
- validações no front-end e no back-end;
- execução contínua em Windows Server com gerenciamento de processo.

## Resultado

- redução do cadastro manual e das tarefas repetitivas;
- prevenção de conflitos de agenda e duplicidades no CRM;
- distribuição mais equilibrada das reuniões;
- rastreabilidade completa desde o formulário até a reunião;
- integração entre formulário, banco de dados, CRM, Google Agenda e Meet;
- experiência mais simples para quem envia a indicação.

## Competências aplicadas

Arquitetura de integrações, APIs REST, OAuth 2.0, automação de processos,
modelagem de banco de dados, validação de regras de negócio, sincronização entre
sistemas, tratamento de erros, segurança de credenciais, testes e implantação
em servidor.

## Confidencialidade

Este estudo de caso apresenta somente a visão funcional. Código proprietário, dados pessoais, IDs internos, tokens, credenciais e regras comerciais específicas não são publicados.
