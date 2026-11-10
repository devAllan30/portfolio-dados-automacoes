# Publicação no servidor Windows

Domínio público: `https://indicacoes.napraticaclub.com.br`

## Requisitos

- Windows Server com Node.js 22.13 ou superior e Nginx.
- DNS do subdomínio apontando para o IP público do servidor.
- Acesso de saída ao RD Station e ao MySQL configurado.

## Aplicação

1. Copie o projeto para `C:\inetpub\indicacoes_napratica`.
2. Crie `.env.local` com as variáveis de `.env.example` e os valores reais.
3. Confirme estas variáveis:

   ```env
   NODE_ENV=production
   APP_HOST=127.0.0.1
   APP_PORT=4320
   INDICATION_BASE_URL=https://indicacoes.napraticaclub.com.br
   ```

4. Instale as dependências e compile:

   ```powershell
   cd C:\inetpub\indicacoes_napratica
   npm ci --include=dev
   npm run build
   npm prune --omit=dev
   ```

5. Inicie o servidor otimizado do Next.js:

   ```powershell
   npm start
   ```

   Esse comando executa `next start` em `127.0.0.1:4320`. Ele não utiliza
   Wrangler, Miniflare nem servidor de desenvolvimento.

6. Para manter a aplicação ativa após fechar o terminal, instale o PM2 e registre
   a configuração incluída no projeto. Este é o mesmo padrão usado nas outras
   automações do servidor:

   ```powershell
   npm install --global pm2
   pm2 startOrReload .\deploy\ecosystem.config.cjs --update-env
   pm2 save
   pm2 status
   ```

   O processo `indicacoes-napratica` deve aparecer com o status `online`. A
   aplicação continuará ativa quando o PowerShell for fechado.

7. Para restaurar o processo automaticamente depois que o Windows Server for
   reiniciado, crie uma tarefa no **Agendador de Tarefas**:

   - Nome: `PM2 - Restaurar automações`.
   - Gatilho: **Ao iniciar o sistema**.
   - Usuário: o mesmo usuário que executou `pm2 save`.
   - Marque: **Executar independentemente de o usuário estar conectado**.
   - Marque: **Executar com privilégios mais altos**.
   - Programa: o caminho devolvido por `where.exe pm2.cmd`.
   - Argumento: `resurrect`.
   - Iniciar em: `C:\inetpub\indicacoes_napratica`.

   Execute a tarefa manualmente uma vez e confirme:

   ```powershell
   pm2 status
   ```

8. O Nginx deve encaminhar o domínio para `http://127.0.0.1:4320`.
9. Verifique `https://indicacoes.napraticaclub.com.br/gerenciador` e teste um
   link individual sem criar uma indicação real.

## Atualização e reinício

Depois de substituir os arquivos ou executar `git pull`:

```powershell
cd C:\inetpub\indicacoes_napratica
npm ci --include=dev
npm run build
npm prune --omit=dev
pm2 startOrReload .\deploy\ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Se a porta `4320` já estiver ocupada por uma execução manual antiga, encerre
somente esse processo antes do `startOrReload`. Depois da migração, não use
`npm start` para manter a aplicação em produção; o processo deve ser controlado
sempre pelo PM2.

O diretório `.next` é gerado por `npm run build` e não deve ser copiado do
ambiente de desenvolvimento.

Nunca envie `.env.local` para o repositório ou exponha suas credenciais em logs.

