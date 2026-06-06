#!/usr/bin/env bash
# Usage: ./patch_ticket_status.sh <ticket_id> <status>
# status: OPEN | PENDING | DONE
curl -s -X PATCH \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"${2:?status required (OPEN|PENDING|DONE)}\"}" \
  "${PHOENIX_API_BASE_URL}/api/v1/tickets/${1:?ticket_id required}/status"
