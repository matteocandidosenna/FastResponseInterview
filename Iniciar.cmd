@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando dependencias do Interview Desk...
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    echo Falha na instalacao. Verifique Node.js e a conexao com a internet.
    pause
    exit /b 1
  )
)
start "Interview Desk" "node_modules\electron\dist\electron.exe" .
