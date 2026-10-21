param(
  [switch]$IncludeLocalEnvironment
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = Join-Path $projectRoot 'releases'
$packageVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$releaseName = if ($IncludeLocalEnvironment) {
  "SORTEIO-v$packageVersion-Windows-IIS-PRONTO"
} else {
  "SORTEIO-v$packageVersion-Windows-IIS"
}
$zipPath = Join-Path $releaseRoot "$releaseName.zip"
$standaloneDirectory = Join-Path $projectRoot '.next\standalone'

Push-Location $projectRoot
try {
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'A compilação de produção falhou.' }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$staticDestination = Join-Path $standaloneDirectory '.next\static'
New-Item -ItemType Directory -Force -Path $staticDestination | Out-Null
Copy-Item -Path (Join-Path $projectRoot '.next\static\*') -Destination $staticDestination -Recurse -Force

$publicDestination = Join-Path $standaloneDirectory 'public'
New-Item -ItemType Directory -Force -Path $publicDestination | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'public\*') -Destination $publicDestination -Recurse -Force

Copy-Item -Path (Join-Path $projectRoot 'deploy\windows\*') -Destination $standaloneDirectory -Recurse -Force

# Materializa as dependencias de producao em uma estrutura portavel. A pasta
# standalone criada pelo Next preserva links internos do pnpm que deixam de
# funcionar depois que o ZIP e extraido em outro computador.
Copy-Item -LiteralPath (Join-Path $projectRoot 'pnpm-lock.yaml') -Destination $standaloneDirectory -Force
$standaloneNodeModules = Join-Path $standaloneDirectory 'node_modules'
if (Test-Path -LiteralPath $standaloneNodeModules) {
  Remove-Item -LiteralPath $standaloneNodeModules -Recurse -Force
}
Push-Location $standaloneDirectory
try {
  pnpm install --prod --frozen-lockfile --node-linker=hoisted --ignore-workspace --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'A instalacao das dependencias de producao falhou.' }
} finally {
  Pop-Location
}

if ($IncludeLocalEnvironment) {
  $localEnvironment = Join-Path $projectRoot '.env.local'
  if (-not (Test-Path -LiteralPath $localEnvironment)) {
    throw 'O parâmetro IncludeLocalEnvironment exige um arquivo .env.local válido.'
  }
  $productionEnvironment = Join-Path $standaloneDirectory '.env.production'
  $environmentLines = Get-Content -LiteralPath $localEnvironment
  $baseUrlConfigured = $false
  $secureCookieConfigured = $false
  $environmentLines = $environmentLines | ForEach-Object {
    if ($_ -match '^EVENTOS_BASE_URL=') {
      $baseUrlConfigured = $true
      'EVENTOS_BASE_URL=https://eventos.qualitycert.com.br'
    } elseif ($_ -match '^AUTH_COOKIE_SECURE=') {
      $secureCookieConfigured = $true
      'AUTH_COOKIE_SECURE=true'
    } else {
      $_
    }
  }
  if (-not $baseUrlConfigured) {
    $environmentLines += 'EVENTOS_BASE_URL=https://eventos.qualitycert.com.br'
  }
  if (-not $secureCookieConfigured) {
    $environmentLines += 'AUTH_COOKIE_SECURE=true'
  }
  $environmentLines | Set-Content -LiteralPath $productionEnvironment -Encoding utf8
}

$databaseDocumentation = Join-Path $standaloneDirectory 'documentacao-banco'
New-Item -ItemType Directory -Force -Path $databaseDocumentation | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'db\mysql-schema.sql') -Destination $databaseDocumentation -Force

@(
  "Qualitycert Eventos v$packageVersion",
  "Gerado em: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))",
  'Destino: C:\inetpub\eventos',
  'Formato dos novos códigos: PREFIXO + 4 números'
) | Set-Content -LiteralPath (Join-Path $standaloneDirectory 'VERSAO.txt') -Encoding utf8

# O -h tambem materializa eventuais links residuais dentro do ZIP.
& tar.exe -a -h -c -f $zipPath -C $standaloneDirectory .
if ($LASTEXITCODE -ne 0) { throw 'A compactação do pacote falhou.' }
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash

Write-Output "Pacote: $zipPath"
Write-Output "SHA256: $hash"
