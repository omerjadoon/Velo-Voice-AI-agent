#!/bin/bash

echo "Starting Voice Agent Stack..."

# Create logs directory if it doesn't exist
LOGS_DIR="$(pwd)/logs"
mkdir -p "$LOGS_DIR"
echo "Logs will be saved to: $LOGS_DIR"

# Clean up any lingering processes on ports 8081, 7880, or python worker
lsof -ti :8081 | xargs kill -9 2>/dev/null
lsof -ti :7880 | xargs kill -9 2>/dev/null
pkill -f "python agent.py" 2>/dev/null
sleep 1

# Start LiveKit dev server in background and pipe to log file + terminal
echo "Starting LiveKit server on ws://127.0.0.1:7880..."
livekit-server --dev 2>&1 | tee "$LOGS_DIR/livekit.log" &
LIVEKIT_PID=$!

# Wait a second for LiveKit to initialize
sleep 2

# Start Python Agent and pipe to log file + terminal
echo "Starting Python Voice Agent..."
(cd backend && source venv/bin/activate && python agent.py start 2>&1 | tee "$LOGS_DIR/agent.log") &
AGENT_PID=$!

# Start Next.js frontend and pipe to log file + terminal
echo "Starting Next.js Frontend..."
(cd frontend && npm run dev 2>&1 | tee "$LOGS_DIR/frontend.log") &
NEXT_PID=$!

echo "All services started!"
echo "- LiveKit Server: ws://127.0.0.1:7880 (log: logs/livekit.log)"
echo "- Python Agent: (log: logs/agent.log)"
echo "- Next.js Frontend: http://localhost:3000 (log: logs/frontend.log)"
echo "Press Ctrl+C to stop all services."

# Cleanup function to kill all spawned background processes
cleanup() {
  echo "Stopping services..."
  kill $LIVEKIT_PID $AGENT_PID $NEXT_PID 2>/dev/null
  pkill -f "python agent.py" 2>/dev/null
  lsof -ti :8081 | xargs kill -9 2>/dev/null
  lsof -ti :7880 | xargs kill -9 2>/dev/null
  exit 0
}

trap cleanup INT TERM EXIT
wait
