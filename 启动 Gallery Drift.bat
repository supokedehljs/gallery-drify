@echo off
setlocal
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

echo Starting Gallery Drift desktop app...
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Please check the error messages above.
  pause
  exit /b 1
)

call npm run electron
if errorlevel 1 (
  echo.
  echo Gallery Drift failed to start. Please check the error messages above.
  pause
  exit /b 1
)

endlocal
