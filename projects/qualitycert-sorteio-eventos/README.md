# Sorteio de Eventos — Qualitycert

Aplicação independente para cadastro de participantes em sorteios presenciais.

As telas são desenvolvidas com abordagem mobile-first para uso prioritário em smartphones.

## Telas

- `CadastroParticipante`: `/{eventoId}/sorteio/{codigoSorteio}`
- `GerenciadorEventos`: `/gerenciadorEventos`
- `PesquisaGanhador`: `/pesquisar`

O gerenciador funciona como painel administrativo: primeiro cadastra os dados do evento, período, prêmio e prefixo. Depois, o botão `+` da listagem vincula uma interação e, no caso de Sorteio, gera de 1 a 10.000 códigos.

## Fluxo

1. Cada evento recebe um ID interno em `Eventos_label` e um prefixo de três caracteres escolhido pelo administrador, inicialmente sem interação.
2. O administrador usa o botão `+` na listagem para vincular o Sorteio; cada ficha recebe então um `codigo_sorteio`, formado pelo prefixo mais 4 números aleatórios, e um QR Code.
3. O QR Code abre `/{eventoId}/sorteio/{codigoSorteio}` e a aplicação valida a chave composta `evento_id + codigo_sorteio`.
4. A tela destaca o prêmio do evento e o participante informa nome, telefone, e-mail, CPF, contabilidade e, opcionalmente, CNPJ.
5. Uma atualização atômica grava os dados, muda o status para `utilizado` e reapresenta o prêmio na confirmação, impedindo o reaproveitamento da ficha.
6. Após o sorteio, o administrador seleciona o evento, pesquisa somente seus códigos utilizados e registra o ganhador em `Eventos_label`.

## Banco MySQL

O arquivo `db/mysql-schema.sql` mantém três tabelas no banco `eventos_qc`:

- `Eventos_label`: cadastro principal do evento, período, prêmio, interação e ganhador.
- `Evento`: códigos e dados dos participantes, vinculados por `evento_id`.
- `Usuario`: login, senha e tipo de acesso (`Admin` ou `User`).

As duas tabelas possuem a coluna `ativo`. Eventos novos e seus códigos nascem ativos. A alteração feita no gerenciador é propagada para todos os códigos, e eventos com `data_final` vencida são inativados automaticamente na próxima operação do sistema.

Copie `.env.example` para `.env.local`, preencha as credenciais e execute:

```bash
pnpm db:setup
pnpm db:remove-qc-prefix
```

Em desenvolvimento, use `EVENTOS_BASE_URL=http://localhost:3000`. O pacote Windows de produção substitui essa variável automaticamente por `https://eventos.qualitycert.com.br`.

Exemplo de carga antecipada:

```sql
INSERT INTO Eventos_label
  (nome_evento, prefixo, data_inicio, data_final, premio)
VALUES
  ('Congresso Contábil 2026', 'CON', '2026-09-01', '2026-09-03', 'Certificado digital');

SET @evento_id = LAST_INSERT_ID();

INSERT INTO Evento (evento_id, tipo_interacao, codigo_sorteio, status)
VALUES
  (@evento_id, 'sorteio', 'CON1749', 'disponivel'),
  (@evento_id, 'sorteio', 'CON8035', 'disponivel');
```

Os códigos possuem índice único composto por `(evento_id, codigo_sorteio)`. O mesmo código pode existir em eventos diferentes.
Sorteio e Roleta podem ser vinculados pelo gerenciador e são identificados pela coluna `Evento.tipo_interacao`.
As tabelas do projeto (`Eventos_label`, `Evento` e `Usuario`) possuem chave primária `id` com `AUTO_INCREMENT`.

Os códigos de Sorteio e Roleta ficam na tabela `Evento` e são separados pela coluna `tipo_interacao`. Para a Roleta, `quantidade_certificados` informa quantos certificados estão vinculados a cada código; o cadastro aceita vários lotes com quantidades diferentes na mesma interação.

## Desenvolvimento

```bash
pnpm dev
pnpm build
pnpm db:migrate
```

Para usar a rota `/12/sorteio/EVE1749`, o evento de ID `12` e o código `EVE1749` precisam existir vinculados no MySQL.

Para a Roleta, a rota pública segue o mesmo formato: `/12/roleta/EVE1749`. A página exibe `quantidade_certificados` antes do cadastro e confirma o benefício após o envio dos dados.

Na listagem do Gerenciador, os badges Sorteio e Roleta são botões de exportação. O CSV utiliza o nome do evento na URL pública, por exemplo `/Congresso%20Contábil%202026/roleta/CON1749`.

O CPF permanece único por evento no Sorteio. Na Roleta, o mesmo CPF pode utilizar mais de um código.

## Acesso ao sistema

A raiz `/` apresenta a tela de login. Usuários do tipo `Admin` acessam `/gerenciadorEventos` e `/pesquisar`; usuários do tipo `User` acessam somente `/pesquisar`. As páginas públicas de Sorteio e Roleta não exigem autenticação.

No Gerenciador, o botão `+ Novo usuário` abre o formulário administrativo com login, senha e tipo. Logins repetidos não são permitidos.

Para criar ou atualizar um usuário pela linha de comando:

```powershell
$env:USUARIO_LOGIN='usuario'
$env:USUARIO_SENHA='senha-com-8-ou-mais-caracteres'
$env:USUARIO_TIPO='Admin'
pnpm db:create-user
```

Por definição deste projeto, a senha é armazenada em texto puro na coluna `Usuario.senha`.
