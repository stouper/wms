@echo off
setlocal
chcp 65001 >nul

REM === 프로젝트 루트로 이동 ===
cd /d "%~dp0"

echo Starting WMS DEV environment...

REM === 1) CORE-API (백엔드) ===
start "core-api" cmd /k "cd /d services\core-api && echo [core-api] starting... && npm run start:dev"

REM === 2) PRISMA STUDIO ===
start "prisma-studio" cmd /k "cd /d services\core-api && echo [prisma] studio starting... && npx prisma studio"

REM === 3) WMS DESKTOP (Electron) ===
start "wms-desktop" cmd /k "cd /d apps\wms-desktop && echo [desktop] starting... && npm run start"

echo.
echo ==========================================
echo  Started: core-api / prisma / wms-desktop
echo ==========================================
echo.
pause
