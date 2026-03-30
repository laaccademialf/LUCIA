@echo off
:: ============================================================
::  LUCIA Print Proxy — Встановлення (запустіть від Адміністратора)
:: ============================================================
::  Цей скрипт:
::  1. Копіює proxy у C:\LUCIA-PrintProxy\
::  2. Створює задачу Windows яка стартує при включенні ПК
::  3. Запускає proxy зараз
::  4. Додає правило Firewall (щоб телефони теж могли друкувати)
::
::  Після встановлення — забудьте про нього. Він працює фоново.
:: ============================================================

echo.
echo   ====================================
echo   LUCIA Print Proxy - Встановлення
echo   ====================================
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] Потрібні права адміністратора.
    echo   [!] Клацніть правою кнопкою - "Запустити від адміністратора"
    echo.
    pause
    exit /b 1
)

:: Create install directory
set INSTALL_DIR=C:\LUCIA-PrintProxy
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy proxy script
copy /Y "%~dp0print-proxy.ps1" "%INSTALL_DIR%\print-proxy.ps1" >nul
echo   [OK] Скопійовано в %INSTALL_DIR%

:: Remove old scheduled task if exists
schtasks /delete /tn "LUCIA Print Proxy" /f >nul 2>&1

:: Create scheduled task (runs at startup as SYSTEM, hidden)
schtasks /create /tn "LUCIA Print Proxy" /tr "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%INSTALL_DIR%\print-proxy.ps1\"" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul
echo   [OK] Задачу створено (автозапуск при включенні ПК)

:: Add firewall rule (allow incoming on port 6101)
netsh advfirewall firewall delete rule name="LUCIA Print Proxy" >nul 2>&1
netsh advfirewall firewall add rule name="LUCIA Print Proxy" dir=in action=allow protocol=tcp localport=6101 >nul
echo   [OK] Правило Firewall додано (порт 6101)

:: Start the proxy now
echo   [..] Запускаю proxy...
schtasks /run /tn "LUCIA Print Proxy" >nul 2>&1

:: Also start visible so user sees the IP
start "LUCIA Print Proxy" powershell.exe -ExecutionPolicy Bypass -File "%INSTALL_DIR%\print-proxy.ps1"

echo.
echo   ====================================
echo   Встановлення завершено!
echo   ====================================
echo.
echo   Proxy працює у фоні та стартуватиме
echo   автоматично при кожному включенні ПК.
echo.
echo   Запишіть IP-адресу з вікна proxy —
echo   вона потрібна для налаштувань на платформі.
echo.
pause
