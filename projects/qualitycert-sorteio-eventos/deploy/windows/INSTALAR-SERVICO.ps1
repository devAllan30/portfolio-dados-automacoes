$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Abra o PowerShell como Administrador para instalar o serviço.'
}

$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$environmentFile = Join-Path $appDirectory '.env.production'
$startScript = Join-Path $appDirectory 'iniciar-eventos.ps1'
$logsDirectory = Join-Path $appDirectory 'logs'
$serviceName = 'QualitycertEventos'
$powershellExecutable = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$nodeExecutable = 'C:\Program Files\nodejs\node.exe'
$nssmCommand = Get-Command nssm.exe -ErrorAction SilentlyContinue

if ($appDirectory -ne 'C:\inetpub\eventos') {
  throw "Extraia o pacote em C:\inetpub\eventos antes de instalar. Diretório atual: $appDirectory"
}
if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Configuração do banco não encontrada: $environmentFile"
}
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw 'Node.js 22 não foi encontrado no caminho padrão. Instale o Node.js 22 LTS x64.'
}
if (-not $nssmCommand) {
  throw 'nssm.exe não foi encontrado no PATH. Instale o NSSM e abra novamente o PowerShell.'
}

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
  & $nssmCommand.Source stop $serviceName | Out-Null
} else {
  & $nssmCommand.Source install $serviceName $powershellExecutable "-NoProfile -ExecutionPolicy Bypass -File $startScript" | Out-Null
}

& $nssmCommand.Source set $serviceName AppDirectory $appDirectory | Out-Null
& $nssmCommand.Source set $serviceName Start SERVICE_AUTO_START | Out-Null
& $nssmCommand.Source set $serviceName AppExit Default Restart | Out-Null
& $nssmCommand.Source set $serviceName AppRestartDelay 5000 | Out-Null
& $nssmCommand.Source set $serviceName AppStdout (Join-Path $logsDirectory 'aplicacao.log') | Out-Null
& $nssmCommand.Source set $serviceName AppStderr (Join-Path $logsDirectory 'erros.log') | Out-Null
& $nssmCommand.Source start $serviceName | Out-Null

Start-Sleep -Seconds 2
$service = Get-Service -Name $serviceName
if ($service.Status -ne 'Running') {
  throw "O serviço foi configurado, mas não iniciou. Consulte $logsDirectory\erros.log"
}

Write-Output 'Serviço QualitycertEventos instalado e em execução.'
Write-Output 'Teste local: http://127.0.0.1:3000/api/health'
