#!/usr/bin/env bash
# Fetches all tickets and their customer-system context from the Phoenix ERP.
# Usage: ./get_all_ticket_contexts.sh

BASE_URL="${PHOENIX_API_BASE_URL:-http://68.210.101.85:8000}"
TOKEN="${PHOENIX_API_TOKEN:-phoenix-team06-f6c91e54ac2793cdf816}"

AUTH=(-H "Authorization: Bearer ${TOKEN}")

echo "=== ALL TICKETS ==="
TICKETS=$(curl -s -X GET "${AUTH[@]}" "${BASE_URL}/api/v1/me/tickets")
echo "${TICKETS}" | python3 -m json.tool 2>/dev/null || echo "${TICKETS}"

echo ""
echo "=== TICKET + CUSTOMER SYSTEM DETAILS ==="

TICKET_IDS=$(echo "${TICKETS}" | python3 -c "
import sys, json
tickets = json.load(sys.stdin)
for t in tickets:
    print(t['id'])
" 2>/dev/null)

for TID in ${TICKET_IDS}; do
  echo ""
  echo "--- Ticket ${TID} ---"
  TICKET=$(curl -s -X GET "${AUTH[@]}" "${BASE_URL}/api/v1/tickets/${TID}")
  echo "${TICKET}" | python3 -m json.tool 2>/dev/null || echo "${TICKET}"

  echo ""
  echo "  [Customer System for ticket ${TID}]"
  SYS=$(curl -s -X GET "${AUTH[@]}" "${BASE_URL}/api/v1/tickets/${TID}/customer-system")
  echo "${SYS}" | python3 -m json.tool 2>/dev/null || echo "${SYS}"
done
