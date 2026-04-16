#!/bin/bash

###############################################################################
#                       GEMINI Desktop Commander Launcher
#                    Complete Package Startup with Process Lifecycle
#                                                                             
#  This launcher manages:                                                    
#  1. Terminal window reuse — avoids creating new windows on repeated launches
#  2. PID tracking — knows exactly which processes it started                 
#  3. Graceful cleanup — kills only its own services, closes Terminal cleanly
#  4. Port isolation — respects port allocation policy                        
###############################################################################

set -e

# ========== CONFIGURATION ==========
STATE_DIR="/tmp/gemini-instance"
STATE_FILE="$STATE_DIR/instance.state"
LOCK_FILE="$STATE_DIR/instance.lock"
LOG_FILE="/tmp/gemini-dev.log"
PID_FILE="$STATE_DIR/dev.pid"
TERMINAL_PID_FILE="$STATE_DIR/terminal.pid"
BROWSER_OPENED_FILE="$STATE_DIR/browser.opened"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========== UTILITY FUNCTIONS ==========

# Initialize state directory
init_state_dir() {
    if [ ! -d "$STATE_DIR" ]; then
        mkdir -p "$STATE_DIR"
    fi
}

# Check if a process is still alive
is_process_alive() {
    local pid=$1
    if [ -z "$pid" ]; then
        return 1
    fi
    kill -0 "$pid" 2>/dev/null
    return $?
}

# Check if Terminal window is still open
is_terminal_alive() {
    local term_pid=$1
    if [ -z "$term_pid" ]; then
        return 1
    fi
    
    # Check if the Terminal process is still alive
    if ! is_process_alive "$term_pid"; then
        return 1
    fi
    
    # Also verify using lsof that the Terminal process still exists
    if lsof -p "$term_pid" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Load previous instance state
load_instance_state() {
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE"
        return 0
    fi
    return 1
}

# Save current instance state
save_instance_state() {
    cat > "$STATE_FILE" << EOF
DEV_PID=$1
INSTANCE_START_TIME=$(date +%s)
INSTANCE_UUID="$(uuidgen)"
EOF
}

# Save Terminal PID
save_terminal_pid() {
    echo "$1" > "$TERMINAL_PID_FILE"
}

# Get Terminal PID
get_terminal_pid() {
    if [ -f "$TERMINAL_PID_FILE" ]; then
        cat "$TERMINAL_PID_FILE"
    fi
}

# Print banner
print_banner() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}           🚀 GEMINI Desktop Commander Launcher${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Print status
print_status() {
    local label=$1
    local message=$2
    local symbol=$3
    
    if [ -z "$symbol" ]; then
        symbol="•"
    fi
    
    echo -e "${YELLOW}${symbol}${NC} ${label}: ${message}"
}

# ========== MAIN EXECUTION ==========

print_banner

init_state_dir

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
print_status "Node.js" "$(node --version)" "✓"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
print_status "npm" "$(npm --version)" "✓"

# Check Chrome Beta
CHROME_BETA=""
if [ -d "/Applications/Chrome Beta.app" ]; then
    CHROME_BETA="/Applications/Chrome Beta.app/Contents/MacOS/Chrome Beta"
elif [ -d "/Applications/Google Chrome Beta.app" ]; then
    CHROME_BETA="/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"
elif [ -d "/Applications/Chromium.app" ]; then
    CHROME_BETA="/Applications/Chromium.app/Contents/MacOS/Chromium"
fi

if [ -z "$CHROME_BETA" ] || [ ! -f "$CHROME_BETA" ]; then
    print_status "Chrome Beta" "Not found — will use default browser" "⚠️"
    CHROME_BETA=""
else
    print_status "Chrome Beta" "Found" "✓"
fi

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Check .env file
if [ ! -f ".env" ]; then
    print_status ".env" "Creating from template" "⚠️"
    cp .env.example .env 2>/dev/null || echo "GEMINI_API_KEY=" > .env
fi

echo ""

# ========== INSTANCE MANAGEMENT ==========

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Checking for previous instance...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

PREVIOUS_INSTANCE_RUNNING=0
PREVIOUS_DEV_PID=""
PREVIOUS_TERMINAL_PID=""

if load_instance_state; then
    PREVIOUS_TERMINAL_PID=$(get_terminal_pid)
    
    if is_terminal_alive "$PREVIOUS_TERMINAL_PID"; then
        print_status "Previous Terminal window" "Still open (PID: $PREVIOUS_TERMINAL_PID)" "✓"
        PREVIOUS_INSTANCE_RUNNING=1
    else
        print_status "Previous Terminal window" "Closed" "ℹ️"
        # Previous session is over: clear browser.opened flag for next session
        rm -f "$BROWSER_OPENED_FILE"
        print_status "Session state" "Cleared (previous Terminal ended)" "↺"
    fi
    
    if [ -f "$PID_FILE" ]; then
        PREVIOUS_DEV_PID=$(cat "$PID_FILE")
        if is_process_alive "$PREVIOUS_DEV_PID"; then
            print_status "Previous dev process" "Still running (PID: $PREVIOUS_DEV_PID)" "✓"
            # Kill old dev process gracefully
            echo -e "${YELLOW}Terminating old dev process...${NC}"
            kill -TERM "$PREVIOUS_DEV_PID" 2>/dev/null || true
            sleep 2
            if is_process_alive "$PREVIOUS_DEV_PID"; then
                kill -9 "$PREVIOUS_DEV_PID" 2>/dev/null || true
            fi
        else
            print_status "Previous dev process" "Already terminated" "ℹ️"
        fi
    fi
else
    print_status "Previous instance" "None found" "ℹ️"
fi

echo ""

# ========== PORT CLEANUP ==========

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Cleaning up ports 13000 and 13001${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Only kill processes we actually started (via PID)
# This respects the port allocation policy: agents only kill their own ports
if [ -n "$PREVIOUS_DEV_PID" ] && is_process_alive "$PREVIOUS_DEV_PID"; then
    echo -e "${YELLOW}Killing only the previous dev process we started (PID: $PREVIOUS_DEV_PID)...${NC}"
    kill -9 "$PREVIOUS_DEV_PID" 2>/dev/null || true
else
    # If no previous process tracked, check for ANY process on these ports
    # This is only done if we don't have a tracked process
    echo -e "${YELLOW}Checking for orphaned processes on ports 13000/13001...${NC}"
    lsof -i :13000,:13001 2>/dev/null | grep -v COMMAND | awk '{print $2}' | sort -u | xargs -r kill -9 2>/dev/null || true
fi

sleep 1
print_status "Ports" "Ready" "✓"
echo ""

# ========== SERVICE STARTUP ==========

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                  Starting GEMINI Services${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Services:${NC}"
echo "  • MCP Backend Server      on ws://localhost:13001/mcp"
echo "  • Vite Frontend Server    on http://localhost:13000"
echo ""

# Clear old log file
> "$LOG_FILE"

# Start the dev server in the background
npm run dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!
print_status "Dev process started" "PID $DEV_PID" "•"

# Save PIDs for next instance
mkdir -p "$STATE_DIR"
save_instance_state "$DEV_PID"
echo "$DEV_PID" > "$PID_FILE"

echo ""

# ========== READINESS CHECK ==========

check_server_ready() {
    local port=$1
    local timeout=30
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        if nc -z localhost $port 2>/dev/null; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

echo -e "${YELLOW}Waiting for MCP server to start...${NC}"
if check_server_ready 13001; then
    print_status "MCP server" "Ready on port 13001" "✓"
else
    echo -e "${RED}❌ MCP server failed to start${NC}"
    echo "Log output:"
    tail -20 "$LOG_FILE"
    kill $DEV_PID 2>/dev/null || true
    exit 1
fi

echo -e "${YELLOW}Waiting for Vite server to start...${NC}"
if check_server_ready 13000; then
    print_status "Vite server" "Ready on port 13000" "✓"
else
    echo -e "${RED}❌ Vite server failed to start${NC}"
    echo "Log output:"
    tail -20 "$LOG_FILE"
    kill $DEV_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    ✓ All services running!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

sleep 2

# ========== BROWSER LAUNCH ==========

# Only open browser if it hasn't been opened in this session yet
# Browser opening is idempotent per session, not per Terminal window
if [ ! -f "$BROWSER_OPENED_FILE" ]; then
    echo -e "${YELLOW}Opening browser...${NC}"
    if [ -n "$CHROME_BETA" ] && [ -f "$CHROME_BETA" ]; then
        open -a "Chrome Beta" "http://localhost:13000" 2>/dev/null || \
        "$CHROME_BETA" "http://localhost:13000" 2>/dev/null || \
        open "http://localhost:13000"
    else
        open "http://localhost:13000"
    fi
    
    # Mark browser as opened this session
    touch "$BROWSER_OPENED_FILE"
    
    echo ""
    print_status "Browser" "Opened at http://localhost:13000" "✓"
    echo ""
else
    echo -e "${YELLOW}Browser already opened this session${NC} (services reloading at http://localhost:13000)"
    echo ""
fi

# ========== TERMINAL LIFECYCLE ==========

# Record this Terminal window's PID if launched from Terminal.app
TERMINAL_PID=$(ps -o ppid= -p $$)
save_terminal_pid "$TERMINAL_PID"

print_status "Terminal PID tracked" "$TERMINAL_PID" "•"
print_status "Services running" "MCP: ws://localhost:13001/mcp | Frontend: http://localhost:13000" "•"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services and close this window${NC}"
echo ""

# ========== GRACEFUL SHUTDOWN ==========

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down GEMINI services...${NC}"
    
    # Kill the dev process
    if is_process_alive "$DEV_PID"; then
        echo -e "${YELLOW}Terminating dev process (PID: $DEV_PID)...${NC}"
        kill -TERM "$DEV_PID" 2>/dev/null || true
        sleep 2
        if is_process_alive "$DEV_PID"; then
            kill -9 "$DEV_PID" 2>/dev/null || true
        fi
    fi
    
    # Clean up state files AND browser flag so next full session opens browser again
    rm -f "$STATE_FILE" "$PID_FILE" "$LOCK_FILE" "$BROWSER_OPENED_FILE" "$TERMINAL_PID_FILE" 2>/dev/null || true
    
    echo -e "${GREEN}✓ Services stopped, terminal window will close${NC}"
    sleep 1
    
    # Exit the script (Terminal window will stay open for user to see messages)
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for the dev process
wait $DEV_PID 2>/dev/null || true

# If dev process exits naturally (should not happen in normal operation)
cleanup
