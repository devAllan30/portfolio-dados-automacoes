# Publicação no servidor

Domínio público: `https://indicacoes.napraticaclub.com.br`

## Requisitos

- Linux com Node.js 22 ou superior, Nginx e Certbot.
- DNS do subdomínio apontando para o IP público do servidor.
- Acesso de saída ao RD Station e ao MySQL configurado.

## Aplicação

1. Copie o projeto para `/var/www/indicacoes`.
2. Crie `.env.local` com as variáveis de `.env.example` e os valores reais.
3. Confirme estas variáveis:

   ```env
   NODE_ENV=production
   APP_HOST=127.0.0.1
   APP_PORT=4318
   INDICATION_BASE_URL=https://indicacoes.napraticaclub.com.br
   ```

4. Instale as dependências e compile:

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   ```

5. Copie `deploy/indicacoes.service.example` para `/etc/systemd/system/indicacoes.service`, ajuste caminhos se necessário e ative:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now indicacoes
   ```

6. Copie `deploy/nginx-indicacoes.conf.example` para `/etc/nginx/sites-available/indicacoes`, habilite o site e valide o Nginx.
7. Emita e configure o HTTPS:

   ```bash
   sudo certbot --nginx -d indicacoes.napraticaclub.com.br
   ```

8. Verifique o serviço em `https://indicacoes.napraticaclub.com.br/gerenciador` e teste um link individual sem criar uma indicação real.

Nunca envie `.env.local` para o repositório ou exponha suas credenciais em logs.
