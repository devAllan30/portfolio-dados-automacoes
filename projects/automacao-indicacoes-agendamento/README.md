# Automação de Indicações e Agendamento Comercial

Versão pública e sanitizada de uma aplicação web que integra formulários B2C e
B2B, banco MySQL, RD Station CRM, Google Calendar e Google Meet.

Nenhum token, senha, chave privada, IP de servidor, arquivo de ambiente ou ID
interno de produção está incluído neste diretório. Todos os valores específicos
da instalação devem ser configurados por variáveis de ambiente.

## Funcionalidades

### Fluxo B2C

- cadastro de um contato e de até dez empresas do mesmo grupo;
- criação de uma negociação por empresa;
- distribuição de todas as negociações para o mesmo responsável;
- registro das empresas relacionadas nas anotações do CRM;
- persistência e rastreabilidade no banco de dados.

### Fluxo B2B

- consulta dos integrantes de uma equipe configurada no RD Station;
- leitura de disponibilidade pelo Google Calendar;
- horários de 30 minutos com antecedência mínima configurada;
- distribuição equilibrada entre os responsáveis disponíveis;
- criação ou atualização da empresa, do contato e da negociação no CRM;
- criação simultânea da tarefa no RD e do evento no Google Agenda;
- criação do Google Meet e inclusão dos participantes;
- configuração do espaço como aberto para convidados com o link;
- inclusão de um endereço de bot de transcrição definido no backend.

## Tecnologias

- TypeScript, React, Node.js e Vinext;
- MySQL;
- APIs RD Station CRM V1 e V2;
- Google Calendar API e Google Meet REST API;
- OAuth 2.0 e conta de serviço com delegação em todo o domínio;
- PM2 e proxy reverso Nginx para execução em servidor.

## Configuração

Requisitos:

- Node.js 22.13 ou superior;
- pnpm;
- MySQL;
- aplicação OAuth do RD Station;
- conta de serviço do Google Workspace com delegação em todo o domínio.

1. Copie `.env.production.example` para `.env.production`.
2. Preencha as credenciais e os IDs da sua própria conta do RD Station.
3. Salve o JSON da conta de serviço fora de `public/` e indique o caminho em
   `GOOGLE_SERVICE_ACCOUNT_FILE`.
4. Autorize os seguintes escopos no Google Workspace:

   ```text
   https://www.googleapis.com/auth/calendar.freebusy
   https://www.googleapis.com/auth/calendar.events.owned
   https://www.googleapis.com/auth/meetings.space.settings
   ```

5. Crie as tabelas usando os arquivos em `database/`.
6. Instale, valide e compile:

   ```bash
   pnpm install --frozen-lockfile
   pnpm run lint
   pnpm run test
   ```

7. Inicie em produção:

   ```bash
   pnpm start
   ```

## Segurança

- `.env*`, chaves privadas, credenciais e diretórios de credenciais são
  ignorados pelo Git;
- as credenciais do banco e do RD ficam somente no backend;
- o navegador não recebe tokens das integrações;
- o JSON da conta de serviço deve permanecer fora da pasta pública;
- os arquivos deste repositório usam somente exemplos e placeholders.

Consulte também as orientações de implantação em
[`deploy/INSTRUCOES_WINDOWS_B2B.md`](deploy/INSTRUCOES_WINDOWS_B2B.md).
