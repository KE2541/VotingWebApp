#!/bin/bash
# ============================================================================
#  Voting System - macOS Portable Launcher
#  Double-click this file or run: chmod +x start-voting-system.command && ./start-voting-system.command
# ============================================================================

APP_NAME="Voting System"
APP_DIR="$(cd "$(dirname "$0")/../../" && pwd)"
PORT="${PORT:-8080}"
DB_NAME="voting_system"
PHP_EXE=""
MYSQL_EXE=""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo "============================================"
echo "       ${CYAN}Voting System Portable Launcher${NC}"
echo "============================================"
echo ""

# --- Step 1: Detect PHP & MySQL ---------------------------------------------
echo -e "${YELLOW}[1/4]${NC} Detecting PHP and MySQL..."

# Check for MAMP
if [ -f "/Applications/MAMP/bin/php/php8.2.0/bin/php" ]; then
    PHP_EXE="/Applications/MAMP/bin/php/php8.2.0/bin/php"
    echo -e "${GREEN}  Found PHP (MAMP)${NC}"
elif [ -f "/Applications/MAMP/bin/php/php8.1.0/bin/php" ]; then
    PHP_EXE="/Applications/MAMP/bin/php/php8.1.0/bin/php"
    echo -e "${GREEN}  Found PHP (MAMP)${NC}"
elif command -v php >/dev/null 2>&1; then
    PHP_EXE=$(command -v php)
    echo -e "${GREEN}  Found PHP: ${PHP_EXE}${NC}"
else
    echo -e "${RED}  ERROR: PHP not found.${NC}"
    echo "  Install Homebrew:  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo "  Then:              brew install php"
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi

# Check for MySQL
if [ -f "/Applications/MAMP/Library/bin/mysql" ]; then
    MYSQL_EXE="/Applications/MAMP/Library/bin/mysql"
    MYSQLD_EXE="/Applications/MAMP/Library/bin/mysqld"
    echo -e "${GREEN}  Found MySQL (MAMP)${NC}"
elif command -v mysql >/dev/null 2>&1; then
    MYSQL_EXE=$(command -v mysql)
    echo -e "${GREEN}  Found MySQL: ${MYSQL_EXE}${NC}"
elif command -v mariadb >/dev/null 2>&1; then
    MYSQL_EXE=$(command -v mariadb)
    echo -e "${GREEN}  Found MariaDB${NC}"
else
    echo -e "${YELLOW}  WARNING: MySQL not found. Installing via Homebrew...${NC}"
    if command -v brew >/dev/null 2>&1; then
        brew install mysql
        brew services start mysql
        MYSQL_EXE=$(command -v mysql)
        echo -e "${GREEN}  MySQL installed.${NC}"
    else
        echo -e "${RED}  ERROR: MySQL not found and Homebrew not available.${NC}"
        echo "  Install MySQL manually or use MAMP (https://www.mamp.info/)"
        read -p "  Press Enter to exit..."
        exit 1
    fi
fi

# --- Step 2: Start MySQL ----------------------------------------------------
echo -e "${YELLOW}[2/4]${NC} Starting MySQL..."

# Try to start MySQL if not running
if command -v mysql.server >/dev/null 2>&1; then
    mysql.server start 2>/dev/null
elif [ -n "$MYSQLD_EXE" ]; then
    "$MYSQLD_EXE" --user=mysql --datadir=/tmp/mysql_data &
fi

# Wait for MySQL to be ready
echo "  Waiting for MySQL..."
for i in $(seq 1 30); do
    "$MYSQL_EXE" -u root -e "SELECT 1" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  MySQL is ready.${NC}"
        break
    fi
    sleep 2
done

# --- Step 3: Setup Database ------------------------------------------------
echo -e "${YELLOW}[3/4]${NC} Setting up database..."

if [ -f "$APP_DIR/database/setup.php" ]; then
    "$PHP_EXE" -r "
        require '$APP_DIR/config/database.php';
        require '$APP_DIR/database/setup.php';
        echo \"Database setup complete.\n\";
    "
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  Database is ready.${NC}"
    else
        echo -e "${RED}  Database setup may have issues.${NC}"
    fi
else
    "$MYSQL_EXE" -u root -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    echo -e "${GREEN}  Database created.${NC}"
fi

# --- Step 4: Start PHP Server & Open Browser --------------------------------
echo -e "${YELLOW}[4/4]${NC} Starting PHP development server..."

# Start PHP server in background
"$PHP_EXE" -S 0.0.0.0:$PORT -t "$APP_DIR" &
PHP_PID=$!

sleep 2

# Open browser
open "http://127.0.0.1:$PORT/"
open "http://127.0.0.1:$PORT/admin/"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Voting System is running!${NC}"
echo -e "${GREEN}  App:     http://127.0.0.1:$PORT/${NC}"
echo -e "${GREEN}  Admin:   http://127.0.0.1:$PORT/admin/${NC}"
echo -e "${GREEN}  Results: http://127.0.0.1:$PORT/results.php${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server.${NC}"
echo ""

# Wait and cleanup on exit
trap "kill $PHP_PID 2>/dev/null; echo 'Server stopped.'; exit 0" SIGINT SIGTERM
wait $PHP_PID
