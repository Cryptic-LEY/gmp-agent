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
$fixedPorts = @(3000, 3002, 3011, 8001)

Write-Host '[GMP LOCAL] Stopping local GMP services...'

if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host "[GMP LOCAL] No local state file found: $stateFile"
  Write-Host '[GMP LOCAL] Nothing was stopped. This avoids accidentally stopping production services.'
  Write-Host '[GMP LOCAL] If you intentionally want to stop every fixed-port GMP service, run stop-gmp.cmd.'
  exit 0
}

try {
  $state = Get-Content -LiteralPath $stateFile | ConvertFrom-Json
} catch {
  Write-Host "[ERROR] Cannot read local state file: $stateFile"
  Write-Host $_.Exception.Message
  exit 1
}

if ($state.mode -ne 'local') {
  Write-Host '[ERROR] State file is not marked as local. Nothing was stopped.'
  exit 1
}

$pids = New-Object System.Collections.Generic.List[int]
foreach ($service in $state.services) {
  if ($service.wrapperPid) { $pids.Add([int]$service.wrapperPid) }
  if ($service.ownerPid) { $pids.Add([int]$service.ownerPid) }
}

$uniquePids = $pids | Sort-Object -Unique
if (-not $uniquePids -or $uniquePids.Count -eq 0) {
  Write-Host '[GMP LOCAL] No recorded local process IDs.'
} else {
  foreach ($processId in $uniquePids) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $proc) {
      Write-Host "[GMP LOCAL] PID $processId is already gone."
      continue
    }

    Write-Host "[GMP LOCAL] Stopping process tree $processId ($($proc.ProcessName))"
    cmd /c "taskkill /PID $processId /T /F"
  }
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

function Test-IsLikelyLocalGmpOwner([int]$port, [int]$processId) {
  switch ($port) {
    3000 { return Test-CommandLineChainContains $processId @('next.*\sdev\b', 'npm\s+run\s+dev\b', 'GMP Local Web') }
    8001 { return Test-CommandLineChainContains $processId @('GMP_ENV=local', 'uvicorn\s+main:app.*--reload', 'GMP Local API') }
    3002 { return Test-CommandLineChainContains $processId @('GMP_ENV=local', 'NODE_ENV=development', 'npm\s+run\s+dev\b', 'GMP Local OpenMAIC') }
    3011 { return Test-CommandLineChainContains $processId @('NODE_ENV=development', 'npm\s+run\s+dev:team-sync\b', 'GMP Local Team Sync') }
    default { return $false }
  }
}

Start-Sleep -Seconds 2

$left = Get-NetTCPConnection -State Listen -LocalPort $fixedPorts -ErrorAction SilentlyContinue
if ($left) {
  foreach ($conn in $left) {
    if (Test-IsLikelyLocalGmpOwner ([int]$conn.LocalPort) ([int]$conn.OwningProcess)) {
      $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
      $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
      Write-Host "[GMP LOCAL] Stopping recovered local child on port $($conn.LocalPort): pid $($conn.OwningProcess) $name"
      cmd /c "taskkill /PID $($conn.OwningProcess) /T /F"
    }
  }
}

Start-Sleep -Seconds 2

$left = Get-NetTCPConnection -State Listen -LocalPort $fixedPorts -ErrorAction SilentlyContinue
if ($left) {
  Write-Host ''
  Write-Host '[WARN] Some fixed ports are still occupied:'
  foreach ($conn in $left) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
    Write-Host "  port $($conn.LocalPort): pid $($conn.OwningProcess) $name"
  }
  Write-Host '[WARN] They may be production services, stale child processes, or protected windows.'
  Write-Host '[WARN] Close the related GMP Local windows manually, or run this script as Administrator.'
  exit 1
}

Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
Write-Host '[GMP LOCAL] All local fixed-port services were stopped.'
Write-Host '[GMP LOCAL] Redis service is left running.'
exit 0
