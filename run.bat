@echo off
title AI Jukebox Dev Server

:: Move to the directory where this batch file is located
cd /d "%~dp0"

:: Set NODE_PATH to resolve packages outside OneDrive build folder
set NODE_PATH=%cd%\node_modules

:: Clear temporary Next.js build cache to ensure clean start
if exist "%temp%\next-jukebox-build" rmdir /s /q "%temp%\next-jukebox-build"

:: Auto-install dependencies if they are missing
if not exist "node_modules\" (
    echo [AI Jukebox] First-time setup: Installing packages, please wait...
    call npm install
)

echo [AI Jukebox] Starting development server with Live Auto-Refresh (Hot Reload)...
echo [AI Jukebox] The browser webpage at http://localhost:3000 will open automatically in 7 seconds.
echo [AI Jukebox] Keep this window open while listening to music.

:: Automatically open the default browser after 7 seconds (Next.js Dev takes ~5s to be ready)
start /b cmd /c "ping 127.0.0.1 -n 8 >nul && start http://localhost:3000"

:: Start the dev server in the active window
call npm run dev
