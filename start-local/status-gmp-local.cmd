@echo off
setlocal EnableExtensions
set "GMP_LOCAL_SCRIPT=%~f0"
set "GMP_LOCAL_ARGS=%*"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$content=[IO.File]::ReadAllText($env:GMP_LOCAL_SCRIPT); $parts=$content -split ':POWERSHELL\r?\n',2; if($parts.Count -lt 2){ Write-Error 'Embedded PowerShell block not found'; exit 1 }; & ([scriptblock]::Create($parts[1]))"
set "STATUS=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %STATUS%

:POWERSHELL
$ErrorActionPreference = 'Continue'

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

$root = Resolve-GmpRoot $env:GMP_LOCAL_SCRIPT
$stateFile = Join-Path $root '.gmp-local\pids.json'
$failed = $false

$services = @(
  [pscustomobject]@{ Key = 'web'; Name = 'Web'; Port = 3000; Health = 'http://127.0.0.1:3000/api/health' },
  [pscustomobject]@{ Key = 'api'; Name = 'GMP API'; Port = 8001; Health = 'http://127.0.0.1:8001/health' },
  [pscustomobject]@{ Key = 'openmaic'; Name = 'OpenMAIC'; Port = 3002; Health = 'http://127.0.0.1:3002/health' },
  [pscustomobject]@{ Key = 'team'; Name = 'Team Sync'; Port = 3011; Health = 'http://127.0.0.1:3011/health' }
)

$state = $null
if (Test-Path -LiteralPath $stateFile) {
  try {
    $state = Get-Content -LiteralPath $stateFile | ConvertFrom-Json
  } catch {
    Write-Host "[WARN] Cannot read local state file: $stateFile"
  }
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

function Get-RecordedService([string]$key) {
  if (-not $state -or -not $state.services) { return $null }
  foreach ($item in $state.services) {
    if ($item.key -eq $key) { return $item }
  }
  return $null
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

Write-Host '[GMP LOCAL] Fixed-port local status'
Write-Host '[GMP LOCAL] Ports: Web 3000, OpenMAIC 3002, Team Sync 3011, GMP API 8001'
if ($state) {
  Write-Host "[GMP LOCAL] State: $stateFile"
  Write-Host "[GMP LOCAL] Session: $($state.sessionId)"
} else {
  Write-Host '[GMP LOCAL] State: none. Listening services may be production or manually started.'
}

foreach ($service in $services) {
  Write-Host ''
  Write-Host "[$($service.Name)] Port $($service.Port)"
  $conn = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) {
    Write-Host '  port: FREE'
    $failed = $true
    continue
  }

  $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host ('  pid: ' + $conn.OwningProcess + '  process: ' + $proc.ProcessName + '  memoryMB: ' + [math]::Round($proc.WorkingSet64 / 1MB, 1))
  } else {
    Write-Host ('  pid: ' + $conn.OwningProcess)
  }

  $recorded = Get-RecordedService $service.Key
  if ($recorded) {
    $ancestors = @()
    if ($recorded.wrapperPid) { $ancestors += [int]$recorded.wrapperPid }
    if ($recorded.ownerPid) { $ancestors += [int]$recorded.ownerPid }
    $owned = Test-IsDescendantOf ([int]$conn.OwningProcess) $ancestors
    if ($owned) {
      Write-Host '  local-state: MATCH'
    } elseif (Test-IsLikelyLocalGmpOwner $service.Key ([int]$conn.OwningProcess)) {
      Write-Host '  local-state: MATCH (recovered child process)'
    } else {
      Write-Host '  local-state: DIFFERENT PROCESS'
    }
  } else {
    Write-Host '  local-state: not recorded'
  }

  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -Uri $service.Health -UseBasicParsing -TimeoutSec 8
    $sw.Stop()
    Write-Host ('  health: HTTP ' + [int]$response.StatusCode + '  ms: ' + $sw.ElapsedMilliseconds)
    if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) {
      $failed = $true
    }
  } catch {
    $sw.Stop()
    Write-Host ('  health: ERR  ms: ' + $sw.ElapsedMilliseconds + '  ' + $_.Exception.Message)
    $failed = $true
  }
}

Write-Host ''
if ($failed) {
  Write-Host '[ERROR] Some local GMP services are not healthy.'
  exit 1
}

Write-Host '[GMP LOCAL] All fixed-port services are healthy.'
exit 0
