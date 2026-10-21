$ErrorActionPreference = 'Stop'

$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$environmentFile = Join-Path $appDirectory '.env.production'
$nodeExecutable = 'C:\Program Files\nodejs\node.exe'

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "Arquivo obrigatório não encontrado: $environmentFile"
}

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw "Node.js não encontrado em: $nodeExecutable"
}

Get-Content -LiteralPath $environmentFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#')) {
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2 -or -not $parts[0].Trim()) {
      throw "Linha inválida no arquivo .env.production: $line"
    }
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1], 'Process')
  }
}

$env:NODE_ENV = 'production'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3000'

Set-Location -LiteralPath $appDirectory
& $nodeExecutable (Join-Path $appDirectory 'server.js')
exit $LASTEXITCODE
