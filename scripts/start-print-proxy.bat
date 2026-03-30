@echo off
title LUCIA Print Proxy
echo.
echo   Запуск LUCIA Print Proxy...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0print-proxy.ps1"
pause
