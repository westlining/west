param(
  [string]$Host = "0.0.0.0",
  [int]$Port = 8080,
  [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appDir

function Resolve-Python {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return $Explicit }

  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $cmd = Get-Command py -ErrorAction SilentlyContinue
  if ($cmd) { return "$($cmd.Source) -3" }

  return $null
}

$pythonCmd = Resolve-Python -Explicit $PythonPath
if (-not $pythonCmd) {
  Write-Host "Python not found in PATH."
  Write-Host "Run with explicit path, example:"
  Write-Host ".\start-server.ps1 -PythonPath 'C:\\Users\\<you>\\AppData\\Local\\Programs\\Python\\Python313\\python.exe'"
  exit 1
}

Write-Host "Starting server using: $pythonCmd"
if ($pythonCmd -like '* -3') {
  & py -3 server.py --host $Host --port $Port
} else {
  & $pythonCmd server.py --host $Host --port $Port
}
