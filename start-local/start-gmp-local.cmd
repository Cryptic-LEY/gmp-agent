@echo off
setlocal EnableExtensions
set "GMP_LOCAL_SCRIPT=%~f0"
set "GMP_LOCAL_ARGS=%*"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$content=[IO.File]::ReadAllText($env:GMP_LOCAL_SCRIPT); $parts=$content -split ':POWERSHELL\r?\n',2; if($parts.Count -lt 2){ Write-Error 'Embedded PowerShell block not found'; exit 1 }; & ([scriptblock]::Create($parts[1]))"
set "STATUS=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %STATUS%

:POWERSHELL
$ErrorActionPreference = 'Stop'

function Resolve-GmpRoot([string]$scriptPath) {
  $current = Split-Path -Parent $scriptPath
  for ($i = 0; $i -lt 6 -and $current; $i++) {
    $hasApi = Test-Path -LiteralPath (Join-Path $current 'gmp-api\main.py')
    $hasWeb = Test-Path -LiteralPath (Join-Path $current 'gmp-web\package.json')
    $hasOpenmaic = Test-Path -LiteralPath (Join-Path $current 'openmaic-service\package.json')
    if ($hasApi -and $hasWeb -and $hasOpenmaic) {
      return $current
    }

    $parent = Split-Path -Parent $current
    if (-not $parent -or $parent -eq $current) { break }
    $current = $parent
  }

  return (Split-Path -Parent $scriptPath)
}

$scriptDir = Split-Path -Parent $env:GMP_LOCAL_SCRIPT
$root = Resolve-GmpRoot $env:GMP_LOCAL_SCRIPT
$apiDir = Join-Path $root 'gmp-api'
$webDir = Join-Path $root 'gmp-web'
$openmaicDir = Join-Path $root 'openmaic-service'
$runDir = Join-Path $root '.gmp-local'
$stateFile = Join-Path $runDir 'pids.json'
$sessionId = [guid]::NewGuid().ToString('N')

$services = @(
  [pscustomobject]@{ Key = 'web'; Name = 'Web'; Port = 3000; Health = 'http://127.0.0.1:3000/api/health' },
  [pscustomobject]@{ Key = 'api'; Name = 'GMP API'; Port = 8001; Health = 'http://127.0.0.1:8001/health' },
  [pscustomobject]@{ Key = 'openmaic'; Name = 'OpenMAIC'; Port = 3002; Health = 'http://127.0.0.1:3002/health' },
  [pscustomobject]@{ Key = 'team'; Name = 'Team Sync'; Port = 3011; Health = 'http://127.0.0.1:3011/health' }
)

function Get-PortOwner([int]$port) {
  Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Assert-PathExists([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Cannot find $label at $path"
  }
}

function Read-LocalState {
  if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
  try {
    $state = Get-Content -LiteralPath $stateFile | ConvertFrom-Json
    if ($state.mode -eq 'local') { return $state }
  } catch {
    return $null
  }
  return $null
}

function Get-RecordedService($state, [string]$key) {
  if (-not $state -or -not $state.services) { return $null }
  foreach ($item in $state.services) {
    if ($item.key -eq $key) { return $item }
  }
  return $null
}

function Test-IsDescendantOf([int]$processId, [int[]]$ancestorIds) {
  if ($ancestorIds -contains $processId) { return $true }
  $current = $processId
  for ($i = 0; $i -lt 24; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue
    if (-not $proc -or -not $proc.ParentProcessId) { return $false }
    if ($ancestorIds -contains [int]$proc.ParentProcessId) { return $true }
    $current = [int]$proc.ParentProcessId
  }
  return $false
}

function Test-IsRecordedLocalOwner($state, [string]$key, [int]$ownerPid) {
  $recorded = Get-RecordedService $state $key
  if (-not $recorded) { return $false }
  $ancestors = @()
  if ($recorded.wrapperPid) { $ancestors += [int]$recorded.wrapperPid }
  if ($recorded.ownerPid) { $ancestors += [int]$recorded.ownerPid }
  if ($ancestors.Count -eq 0) { return $false }
  return Test-IsDescendantOf $ownerPid $ancestors
}

function Get-CommandLineChain([int]$processId) {
  $commands = @()
  $current = $processId
  for ($i = 0; $i -lt 24; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    $commands += [string]$proc.CommandLine
    if (-not $proc.ParentProcessId) { break }
    $current = [int]$proc.ParentProcessId
  }
  return $commands
}

function Test-CommandLineChainContains([int]$processId, [string[]]$patterns) {
  $joined = (Get-CommandLineChain $processId) -join "`n"
  foreach ($pattern in $patterns) {
    if ($joined -match $pattern) { return $true }
  }
  return $false
}

function Test-IsLikelyLocalGmpOwner([string]$key, [int]$processId) {
  switch ($key) {
    'web' { return Test-CommandLineChainContains $processId @('next.*\sdev\b', 'npm\s+run\s+dev\b', 'GMP Local Web') }
    'api' { return Test-CommandLineChainContains $processId @('GMP_ENV=local', 'uvicorn\s+main:app.*--reload', 'GMP Local API') }
    'openmaic' { return Test-CommandLineChainContains $processId @('GMP_ENV=local', 'NODE_ENV=development', 'npm\s+run\s+dev\b', 'GMP Local OpenMAIC') }
    'team' { return Test-CommandLineChainContains $processId @('NODE_ENV=development', 'npm\s+run\s+dev:team-sync\b', 'GMP Local Team Sync') }
    default { return $false }
  }
}

function Start-LocalService([string]$key, [string]$name, [int]$port, [string]$workDir, [string]$command) {
  Write-Host "[GMP LOCAL] Starting $name on port $port..."
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/k', $command) `
    -WorkingDirectory $workDir `
    -WindowStyle Minimized `
    -PassThru

  [pscustomobject]@{
    key = $key
    name = $name
    port = $port
    wrapperPid = $proc.Id
    ownerPid = $null
  }
}

Write-Host '[GMP LOCAL] Starting GMP platform in local mode...'
Write-Host "[GMP LOCAL] Root: $root"
Write-Host '[GMP LOCAL] Fixed ports only: Web 3000, OpenMAIC 3002, Team Sync 3011, GMP API 8001'
Write-Host '[GMP LOCAL] No extra ports will be created. If production is running, startup will stop here.'
Write-Host ''

Assert-PathExists (Join-Path $apiDir 'main.py') 'gmp-api\main.py'
Assert-PathExists (Join-Path $webDir 'package.json') 'gmp-web\package.json'
Assert-PathExists (Join-Path $openmaicDir 'package.json') 'openmaic-service\package.json'

$existingState = Read-LocalState
$blocked = $false
$occupiedCount = 0
$recordedLocalCount = 0
foreach ($service in $services) {
  $conn = Get-PortOwner $service.Port
  if ($conn) {
    $occupiedCount += 1
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    $processText = if ($proc) { "$($proc.ProcessName) pid=$($conn.OwningProcess)" } else { "pid=$($conn.OwningProcess)" }
    if ((Test-IsRecordedLocalOwner $existingState $service.Key ([int]$conn.OwningProcess)) -or (Test-IsLikelyLocalGmpOwner $service.Key ([int]$conn.OwningProcess))) {
      $recordedLocalCount += 1
      Write-Host "[GMP LOCAL] Port $($service.Port) is already used by local $($service.Name) ($processText)."
    } else {
      $blocked = $true
      Write-Host "[ERROR] Port $($service.Port) is occupied by $processText. $($service.Name) cannot start."
    }
  } else {
    Write-Host "[GMP LOCAL] Port $($service.Port) is free for $($service.Name)."
  }
}

if (-not $blocked -and $recordedLocalCount -eq $services.Count) {
  Write-Host ''
  Write-Host '[GMP LOCAL] Local GMP is already running. Showing current status.'
  $statusScript = Join-Path $scriptDir 'status-gmp-local.cmd'
  if (-not (Test-Path -LiteralPath $statusScript)) {
    $statusScript = Join-Path $root 'status-gmp-local.cmd'
  }
  & $statusScript --no-pause
  exit $LASTEXITCODE
}

if (-not $blocked -and $recordedLocalCount -gt 0) {
  Write-Host ''
  Write-Host '[ERROR] Some local GMP services are already running, but the fixed-port set is incomplete.'
  Write-Host '[GMP LOCAL] Run stop-gmp-local.cmd first, then run start-gmp-local.cmd again.'
  exit 1
}

if ($blocked) {
  Write-Host ''
  Write-Host '[ERROR] One or more fixed ports are occupied. Nothing was started.'
  Write-Host '[GMP LOCAL] Stop the running GMP service first, then run start-gmp-local.cmd again.'
  exit 1
}

if (-not (Test-Path -LiteralPath $runDir)) {
  New-Item -ItemType Directory -Path $runDir | Out-Null
}
if (Test-Path -LiteralPath $stateFile) {
  Remove-Item -LiteralPath $stateFile -Force
}

try {
  $redisService = Get-Service -Name 'redis' -ErrorAction SilentlyContinue
  if ($redisService) {
    if ($redisService.Status -ne 'Running') {
      Write-Host '[GMP LOCAL] Redis service exists but is not running. Trying to start it...'
      Start-Service -Name 'redis' -ErrorAction Continue
    } else {
      Write-Host '[GMP LOCAL] Redis service is already running.'
    }
  } else {
    Write-Host '[WARN] Redis Windows service was not found. Team mode needs Redis on port 6379.'
  }
} catch {
  Write-Host '[WARN] Redis did not start. Start Redis manually if team mode needs it.'
}

$pythonExe = if (Test-Path -LiteralPath (Join-Path $apiDir '.venv\Scripts\python.exe')) {
  Join-Path $apiDir '.venv\Scripts\python.exe'
} else {
  'python'
}

$apiReload = if ($env:GMP_API_RELOAD -eq '0') { '' } else { ' --reload' }
$started = @()
$started += Start-LocalService 'api' 'GMP API' 8001 $apiDir "title GMP Local API :8001 && cd /d ""$apiDir"" && set ""GMP_ENV=local"" && set ""GMP_LOCAL_SESSION=$sessionId"" && ""$pythonExe"" -m uvicorn main:app$apiReload --host 0.0.0.0 --port 8001"
$started += Start-LocalService 'openmaic' 'OpenMAIC' 3002 $openmaicDir "title GMP Local OpenMAIC :3002 && cd /d ""$openmaicDir"" && set ""NODE_ENV=development"" && set ""PORT=3002"" && set ""GMP_LOCAL_SESSION=$sessionId"" && npm run dev"
$started += Start-LocalService 'team' 'Team Sync' 3011 $webDir "title GMP Local Team Sync :3011 && cd /d ""$webDir"" && set ""NODE_ENV=development"" && set ""TEAM_SYNC_PORT=3011"" && set ""GMP_LOCAL_SESSION=$sessionId"" && npm run dev:team-sync"
$started += Start-LocalService 'web' 'Web' 3000 $webDir "title GMP Local Web :3000 && cd /d ""$webDir"" && set ""NODE_ENV=development"" && set ""NEXT_TELEMETRY_DISABLED=1"" && set ""GMP_LOCAL_SESSION=$sessionId"" && npm run dev"

Start-Sleep -Seconds 8

foreach ($entry in $started) {
  $owner = Get-PortOwner ([int]$entry.port)
  if ($owner) {
    $entry.ownerPid = [int]$owner.OwningProcess
  }
}

$state = [pscustomobject]@{
  mode = 'local'
  sessionId = $sessionId
  root = $root
  createdAt = (Get-Date).ToString('o')
  fixedPorts = $services
  services = $started
}
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host ''
$statusScript = Join-Path $scriptDir 'status-gmp-local.cmd'
if (-not (Test-Path -LiteralPath $statusScript)) {
  $statusScript = Join-Path $root 'status-gmp-local.cmd'
}
& $statusScript --no-pause
$statusCode = $LASTEXITCODE

Write-Host ''
Write-Host '[GMP LOCAL] Open:'
Write-Host '  http://localhost:3000'
Write-Host '  http://localhost:3000/simulation'
Write-Host ''
Write-Host '[GMP LOCAL] Done.'
exit $statusCode
