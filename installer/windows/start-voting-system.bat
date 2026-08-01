@echo off
title Voting System Launcher
setlocal enabledelayedexpansion

:: --- Configuration ----------------------------------------------------------
set APP_NAME=Voting System
set APP_DIR=%~dp0VotingWebApp
set DB_NAME=voting_system
set DB_USER=root
set DB_PASS=
set PORT=8080
set PHP_EXE=
set MYSQL_EXE=
set XAMPP_DIR=

:: --- Color helpers ----------------------------------------------------------
set "ESC="
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64" set "ESC=echo"
if defined ESC (
    for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
)
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "RED=%ESC%[91m"
set "CYAN=%ESC%[96m"
set "NC=%ESC%[0m"

cls
echo ============================================
echo       %CYAN%Voting System Portable Launcher%NC%
echo ============================================
echo.

:: --- Step 1: Detect XAMPP ---------------------------------------------------
echo %YELLOW%[1/4]%NC% Detecting XAMPP installation...

set XAMPP_CANDIDATES="C:\xampp" "C:\Program Files\xampp" "C:\Program Files (x86)\xampp" "D:\xampp" "E:\xampp"

for %%p in (%XAMPP_CANDIDATES%) do (
    if exist "%%p\php\php.exe" if exist "%%p\mysql\bin\mysql.exe" (
        set XAMPP_DIR=%%~p
        set PHP_EXE=%%~p\php\php.exe
        set MYSQL_EXE=%%~p\mysql\bin\mysql.exe
        set MYSQLD_EXE=%%~p\mysql\bin\mysqld.exe
        echo %GREEN%  Found XAMPP at: %%p%NC%
        goto :found_xampp
    )
)

:: Fallback: check PATH
where php.exe >nul 2>nul
if !ERRORLEVEL! EQU 0 (
    set PHP_EXE=php.exe
    echo %GREEN%  Found PHP in PATH%NC%
)
where mysql.exe >nul 2>nul
if !ERRORLEVEL! EQU 0 (
    set MYSQL_EXE=mysql.exe
    echo %GREEN%  Found MySQL in PATH%NC%
)
if defined PHP_EXE if defined MYSQL_EXE goto :found_xampp

echo %RED%  ERROR: XAMPP not found.%NC%
echo   Install XAMPP from https://www.apachefriends.org/
echo   Then run this launcher again.
pause
exit /b 1

:found_xampp

:: --- Step 2: Start MySQL ----------------------------------------------------
echo %YELLOW%[2/4]%NC% Starting MySQL server...

if defined MYSQLD_EXE (
    "%MYSQLD_EXE%" --defaults-file="%XAMPP_DIR%\mysql\bin\my.ini" --console 2>nul
    if !ERRORLEVEL! NEQ 0 (
        :: MariaDB (XAMPP >= 8) uses mariadbd.exe
        set MYSQLD_EXE="%XAMPP_DIR%\mysql\bin\mariadbd.exe"
        if exist !MYSQLD_EXE! (
            !MYSQLD_EXE! --defaults-file="%XAMPP_DIR%\mysql\bin\my.ini" --console 2>nul
        )
    )
)

:: Wait for MySQL to be ready
echo   Waiting for MySQL to start...
for /l %%i in (1,1,30) do (
    "%MYSQL_EXE%" -u%DB_USER% -e "SELECT 1" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        echo %GREEN%  MySQL is ready.%NC%
        goto :mysql_ready
    )
    ping -n 2 127.0.0.1 >nul
)
echo %RED%  ERROR: MySQL failed to start.%NC%
pause
exit /b 1

:mysql_ready

:: --- Step 3: Setup Database ------------------------------------------------
echo %YELLOW%[3/4]%NC% Setting up database...

if not exist "%APP_DIR%" (
    :: Running from the same directory as the app files
    set APP_DIR=%~dp0
)

if exist "%APP_DIR%\config\database.php" (
    "%PHP_EXE%" -r "
        require '%APP_DIR%/config/database.php';
        require '%APP_DIR%/database/setup.php';
        echo 'Database setup complete.\n';
    "
    if !ERRORLEVEL! EQU 0 (
        echo %GREEN%  Database is ready.%NC%
    ) else (
        echo %RED%  Database setup may have issues.%NC%
    )
) else (
    :: Create database manually
    "%MYSQL_EXE%" -u%DB_USER% -e "CREATE DATABASE IF NOT EXISTS `%DB_NAME%` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    echo %GREEN%  Database created.%NC%
)

:: --- Step 4: Start PHP Server and Open Browser -----------------------------
echo %YELLOW%[4/4]%NC% Starting PHP development server...

start "PHP Server" /B "%PHP_EXE%" -S 0.0.0.0:%PORT% -t "%APP_DIR%"

:: Give it a moment
timeout /t 2 /nobreak >nul

:: Open browser
start http://127.0.0.1:%PORT%/
start http://127.0.0.1:%PORT%/admin/

echo.
echo %GREEN%============================================%NC%
echo %GREEN%  Voting System is running!%NC%
echo %GREEN%  http://127.0.0.1:%PORT%/%NC%
echo %GREEN%  Admin: http://127.0.0.1:%PORT%/admin/%NC%
echo %GREEN%  Results: http://127.0.0.1:%PORT%/results.php%NC%
echo %GREEN%============================================%NC%
echo.
echo %YELLOW%Press Ctrl+C in the PHP server window to stop.%NC%
echo.

:: Keep running
"%PHP_EXE%" -S 0.0.0.0:%PORT% -t "%APP_DIR%"

pause
