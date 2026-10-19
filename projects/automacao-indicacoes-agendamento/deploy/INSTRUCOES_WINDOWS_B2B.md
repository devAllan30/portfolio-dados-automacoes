# Atualizacao B2B e B2C no Windows Server

## Rota oficial

```text
https://indicacoes.exemplo.com/B2B/id_Banco=NomeParceiro/Consultor/Curva/Setor/Documento
https://indicacoes.exemplo.com/B2C/id_Banco=NomeParceiro/Consultor/Curva/Setor/Documento
```

O documento recebido no link deve chegar somente com numeros.

## Permissao adicional do Google Meet

Para que o MeetGeek e os demais convidados entrem sem pedir autorizacao, a
aplicacao configura cada sala do Meet com acesso `OPEN`. Antes de publicar esta
versao:

1. Ative a **Google Meet REST API** no mesmo projeto do Google Cloud usado pela
   conta de servico.
2. No Admin Console do Google Workspace, edite a delegacao em todo o dominio do
   Client ID da conta de servico e acrescente este escopo, preservando os
   escopos do Google Calendar que ja existem:

   ```text
   https://www.googleapis.com/auth/meetings.space.settings
   ```

Se o Google nao confirmar `OPEN`, a aplicacao exclui o evento criado e retorna
erro, em vez de concluir um agendamento no qual o bot poderia ficar bloqueado.

## Atualizar a aplicacao

1. Pare temporariamente o processo:

   ```powershell
   pm2 stop automacao-indicacoes
   ```

2. Extraia o ZIP na pasta atual da aplicacao, substituindo os arquivos. Nao
   exclua nem substitua o arquivo `.env.production` que ja esta no servidor.

3. Abra o PowerShell na pasta da aplicacao e execute:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm run build
   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
   pm2 save
   pm2 status
   ```

4. Confirme que `automacao-indicacoes` aparece com o status `online`.

## Manter ativo depois de reiniciar o Windows

O `autorestart` do arquivo `deploy/ecosystem.config.cjs` reinicia a aplicacao se
ela parar por erro. Para recuperar o processo depois que o Windows Server for
reiniciado, crie uma tarefa no **Agendador de Tarefas**:

- Gatilho: **Ao iniciar o sistema**.
- Usuario: o mesmo usuario que executou `pm2 save`.
- Marque: **Executar independentemente de o usuario estar conectado**.
- Programa: o caminho devolvido pelo comando `where.exe pm2`.
- Argumento: `resurrect`.
- Iniciar em: a pasta da aplicacao.

Depois de salvar a tarefa, execute-a manualmente uma vez e confira novamente:

```powershell
pm2 status
```
