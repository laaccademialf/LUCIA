@echo off
:: LUCIA Print Proxy — Видалення
:: Запустіть від Адміністратора

echo.
echo   Видалення LUCIA Print Proxy...
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] Потрібні права адміністратора.
    pause
    exit /b 1
)

:: Stop and remove scheduled task
schtasks /end /tn "LUCIA Print Proxy" >nul 2>&1
schtasks /delete /tn "LUCIA Print Proxy" /f >nul 2>&1
echo   [OK] Задачу видалено

:: Remove firewall rule
netsh advfirewall firewall delete rule name="LUCIA Print Proxy" >nul 2>&1
echo   [OK] Правило Firewall видалено

:: Remove install directory
if exist "C:\LUCIA-PrintProxy" rmdir /s /q "C:\LUCIA-PrintProxy"
echo   [OK] Файли видалено

echo.
echo   Видалення завершено.
echo.
pause
