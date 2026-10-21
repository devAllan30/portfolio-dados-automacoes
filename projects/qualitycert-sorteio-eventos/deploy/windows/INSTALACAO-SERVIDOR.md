# Instalação no servidor Windows/IIS

Pacote preparado para o diretório `C:\inetpub\eventos`.

## 1. Pré-requisitos

Instale no servidor:

- Node.js 22 LTS x64 no caminho padrão `C:\Program Files\nodejs\node.exe`;
- IIS;
- IIS URL Rewrite;
- IIS Application Request Routing (ARR);
- NSSM (Non-Sucking Service Manager) para executar a aplicação como serviço do Windows.

No IIS Manager, abra **Application Request Routing Cache > Server Proxy Settings** e marque **Enable proxy**.

## 2. Copiar o pacote

1. Pare o serviço, caso já exista: `nssm stop QualitycertEventos`.
2. Faça backup do conteúdo atual de `C:\inetpub\eventos`.
3. Extraia todo o ZIP diretamente em `C:\inetpub\eventos`.
4. Se o pacote personalizado já possuir `.env.production`, não é necessário renomear ou preencher nenhum arquivo.
5. Caso exista apenas `.env.production.example`, copie-o para `.env.production` e preencha as cinco variáveis `RD_DB_*`.

Nunca publique ou envie o arquivo `.env.production` com a senha preenchida.

## 3. Banco de dados

O pacote não altera códigos já cadastrados. A regra `PREFIXO + 4 números` vale para novos códigos de Sorteio e Roleta.

Antes de publicar, confirme que as tabelas `Eventos_label`, `Evento` e `Usuario` já existem no banco `eventos_qc`. As três possuem `id` com `AUTO_INCREMENT`. Para uma instalação nova, use o arquivo `mysql-schema.sql` incluído em `documentacao-banco`.

## 4. Criar o serviço 24 horas

Abra o PowerShell como Administrador e execute, ajustando o caminho do `nssm.exe` se necessário:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "C:\inetpub\eventos\INSTALAR-SERVICO.ps1"
```

Esse instalador executa automaticamente as configurações abaixo. Se preferir configurar manualmente:

```powershell
nssm install QualitycertEventos "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File C:\inetpub\eventos\iniciar-eventos.ps1"
nssm set QualitycertEventos AppDirectory "C:\inetpub\eventos"
nssm set QualitycertEventos Start SERVICE_AUTO_START
nssm set QualitycertEventos AppExit Default Restart
nssm set QualitycertEventos AppRestartDelay 5000
nssm set QualitycertEventos AppStdout "C:\inetpub\eventos\logs\aplicacao.log"
nssm set QualitycertEventos AppStderr "C:\inetpub\eventos\logs\erros.log"
New-Item -ItemType Directory -Force -Path "C:\inetpub\eventos\logs"
nssm start QualitycertEventos
```

O serviço inicia junto com o Windows e reinicia a aplicação cinco segundos após uma falha.

## 5. Configurar o IIS

1. Crie um site no IIS apontando para `C:\inetpub\eventos`.
2. Configure o binding do domínio `eventos.qualitycert.com.br` nas portas 80 e 443.
3. Instale/selecione o certificado HTTPS no binding 443.
4. Use um Application Pool com **.NET CLR Version: No Managed Code**.
5. Confirme que o arquivo `web.config` está na raiz do site.

O IIS recebe os acessos públicos e encaminha internamente para `127.0.0.1:3000`. Não exponha a porta 3000 no firewall externo.

## 6. Validar

No próprio servidor:

```powershell
Get-Service QualitycertEventos
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

O endpoint deve responder `status: ok` e `database: connected`. Depois, valide externamente:

- `https://eventos.qualitycert.com.br/api/health`
- `https://eventos.qualitycert.com.br/gerenciadorEventos`
- `https://eventos.qualitycert.com.br/pesquisar`

## Atualizações futuras

Pare o serviço, preserve `.env.production` e a pasta `logs`, substitua os demais arquivos pelo novo pacote e inicie novamente:

```powershell
nssm stop QualitycertEventos
nssm start QualitycertEventos
```
