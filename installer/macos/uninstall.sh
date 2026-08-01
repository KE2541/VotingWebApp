#!/bin/bash
# ============================================================================
#  Voting System - macOS Uninstaller
#  Run: chmod +x uninstall.sh && ./uninstall.sh
# ============================================================================
set -e

APP_NAME="Voting System"
APP_DIR="/Applications/VotingSystem"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}============================================${NC}"
echo -e "${RED}  Uninstall ${APP_NAME}${NC}"
echo -e "${RED}============================================${NC}"
echo ""

read -p "Are you sure you want to uninstall? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo -e "${YELLOW}[1/3]${NC} Stopping server..."
launchctl stop com.votingapp.server 2>/dev/null || true
launchctl unload "$HOME/Library/LaunchAgents/com.votingapp.server.plist" 2>/dev/null || true

echo -e "${YELLOW}[2/3]${NC} Removing files..."
rm -rf "$APP_DIR"
rm -f "$HOME/Library/LaunchAgents/com.votingapp.server.plist"
rm -f "$HOME/Desktop/VotingSystem.command"
rm -f "/Applications/VotingSystem.command"

echo -e "${YELLOW}[3/3]${NC} Dropping database..."
DB_EXISTS=$(mysql -u root -se "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='voting_system'" 2>/dev/null)
if [ -n "$DB_EXISTS" ]; then
    mysql -u root -e "DROP DATABASE voting_system" 2>/dev/null && echo -e "${GREEN}  Database dropped.${NC}" || echo -e "${YELLOW}  Could not drop database (check permissions).${NC}"
fi

echo ""
echo -e "${GREEN}Uninstall complete.${NC}"
