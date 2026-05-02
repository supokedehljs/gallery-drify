@echo off
setlocal
set "APP_DIR=%~dp0"
set "URL=http://localhost:4173"

cd /d "%APP_DIR%"

echo Starting Gallery Drift...
start "Gallery Drift Server" cmd /c "npm run dev"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(20); while((Get-Date) -lt $deadline){ try { $r=Invoke-WebRequest -Uri 'http://localhost:4173' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process 'http://localhost:4173'; exit 0 } } catch {} Start-Sleep -Milliseconds 700 }; Start-Process 'http://localhost:4173'"

endlocal
