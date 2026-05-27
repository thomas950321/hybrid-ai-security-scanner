@echo off
cd /d "C:\Users\thoma_eyrly4b\Documents\New project"
set AI_API_KEY=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
start "API Server" cmd /c "pnpm dev:api"
timeout /t 5 /nobreak >nul
echo API server should be starting on port 4000...
