#!/bin/bash
# ============================================================================
#  Voting System - macOS Installer Script
#  Run: chmod +x install.sh && ./install.sh
# ============================================================================
set -e

APP_NAME="Voting System"
APP_DIR="/Applications/VotingSystem"
PORT="${PORT:-8080}"
DB_NAME="voting_system"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  ${APP_NAME} - macOS Installation${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/5]${NC} Checking prerequisites..."

if ! command -v php >/dev/null 2>&1; then
    echo -e "${YELLOW}  PHP not found. Installing via Homebrew...${NC}"
    if command -v brew >/dev/null 2>&1; then
        brew install php
    else
        echo -e "${RED}  ERROR: Please install Homebrew first:${NC}"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
fi
echo -e "${GREEN}  PHP: $(php -v | head -1)${NC}"

if ! command -v mysql >/dev/null 2>&1 && ! command -v mariadb >/dev/null 2>&1; then
    echo -e "${YELLOW}  MySQL not found. Installing via Homebrew...${NC}"
    if command -v brew >/dev/null 2>&1; then
        brew install mysql
        brew services start mysql
    else
        echo -e "${RED}  ERROR: Please install MySQL manually or use MAMP${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}  MySQL: $(mysql --version)${NC}"

# Install
echo -e "${YELLOW}[2/5]${NC} Installing application..."

# Determine source directory
if [ -d "$(dirname "$0")/../admin" ]; then
    SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
    SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

echo "  Source: $SRC_DIR"
echo "  Target: $APP_DIR"

# Remove previous installation if present
if [ -d "$APP_DIR" ]; then
    echo "  Removing previous installation..."
    rm -rf "$APP_DIR"
fi

# Copy files (exclude dev files)
rsync -av \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='_diag*' \
    --exclude='_fix_*' \
    --exclude='Votesys.zip' \
    --exclude='installer/output' \
    --exclude='installer/dist' \
    "$SRC_DIR/" "$APP_DIR/"

echo -e "${GREEN}  Files installed to $APP_DIR${NC}"

# Make launcher executable
if [ -f "$APP_DIR/installer/macos/start-voting-system.command" ]; then
    chmod +x "$APP_DIR/installer/macos/start-voting-system.command"
fi

# Setup database
echo -e "${YELLOW}[3/5]${NC} Setting up database..."
"$APP_DIR/config/database.php" 2>/dev/null || \
php -r "
    require '$APP_DIR/config/database.php';
    require '$APP_DIR/database/setup.php';
    echo \"Database setup complete.\n\";
"
echo -e "${GREEN}  Database ready.${NC}"

# Create launch agent (auto-start on login)
echo -e "${YELLOW}[4/5]${NC} Creating launch agent..."

LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
LAUNCH_AGENT_FILE="$LAUNCH_AGENT_DIR/com.votingapp.server.plist"
mkdir -p "$LAUNCH_AGENT_DIR"

cat > "$LAUNCH_AGENT_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.votingapp.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/php</string>
        <string>-S</string>
        <string>0.0.0.0:$PORT</string>
        <string>-t</string>
        <string>$APP_DIR</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$APP_DIR</string>
    <key>StandardOutPath</key>
    <string>$APP_DIR/logs/server.log</string>
    <key>StandardErrorPath</key>
    <string>$APP_DIR/logs/server-error.log</string>
</dict>
</plist>
EOF

mkdir -p "$APP_DIR/logs"
launchctl load "$LAUNCH_AGENT_FILE" 2>/dev/null || true
echo -e "${GREEN}  Launch agent created. Server starts automatically on login.${NC}"

# Create Desktop shortcut
echo -e "${YELLOW}[5/5]${NC} Creating shortcuts..."

DESKTOP_SHORTCUT="$HOME/Desktop/VotingSystem.command"
cat > "$DESKTOP_SHORTCUT" << EOF
#!/bin/bash
open http://127.0.0.1:$PORT/
EOF
chmod +x "$DESKTOP_SHORTCUT"

# Create link in Applications
ln -sf "$APP_DIR/installer/macos/start-voting-system.command" "/Applications/VotingSystem.command" 2>/dev/null || true

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}  App installed to: $APP_DIR${NC}"
echo -e "${GREEN}  Access at:        http://127.0.0.1:$PORT/${NC}"
echo -e "${GREEN}  Admin:            http://127.0.0.1:$PORT/admin/${NC}"
echo -e "${GREEN}  Results:          http://127.0.0.1:$PORT/results.php${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}The server starts automatically when you log in.${NC}"
echo -e "${YELLOW}To start now, run:${NC}"
echo "  launchctl start com.votingapp.server"
echo ""
echo -e "${YELLOW}Or click: Desktop/VotingSystem.command${NC}"
echo ""
