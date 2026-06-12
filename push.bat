@echo off
echo.
echo ==========================================
echo   Resolvo — Push to GitHub + Auto Deploy
echo ==========================================
echo.

cd /d "%~dp0"

:: Stage all changes
git add -A

:: Check if there's anything to commit
git diff --cached --quiet
if %errorlevel%==0 (
  echo [INFO] Nothing new to commit — pushing existing commits...
  goto push
)

:: Ask for commit message
set /p MSG="Commit message (or press Enter for auto): "
if "%MSG%"=="" set MSG=Update %date% %time%

git commit -m "%MSG%"

:push
echo.
echo [PUSH] Pushing to GitHub...
git push origin main

if %errorlevel%==0 (
  echo.
  echo [OK] Pushed! GitHub Actions will now auto-deploy to your VPS.
  echo      Watch progress at: https://github.com/Mrsk82/Resolvo/actions
  echo.
) else (
  echo.
  echo [ERROR] Push failed. Check your internet or GitHub credentials.
  echo.
)
pause
