@echo off
title Hollowhearth - Online
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
node tools/online.js
pause
