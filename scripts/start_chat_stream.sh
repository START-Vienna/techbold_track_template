#!/usr/bin/env bash
# Usage: ./start_chat_stream.sh [ticket_id]
# Defaults to ticket 7001 if no argument given.

TICKET_ID="${1:-7001}"
BASE_URL="http://localhost:80"

echo "Creating chat for ticket ${TICKET_ID}..."
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/chats" \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\": \"${TICKET_ID}\"}")

echo "${RESPONSE}"

CHAT_ID=$(echo "${RESPONSE}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "${CHAT_ID}" ]; then
  echo "ERROR: could not extract chat id from response" >&2
  exit 1
fi

echo ""
echo "Streaming events for chat ${CHAT_ID}..."
echo "---"
curl -N "${BASE_URL}/api/chats/${CHAT_ID}/stream"
