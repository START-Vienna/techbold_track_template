#!/usr/bin/env bash
# Usage: ./post_activity.sh '<json_body>'
# Example: ./post_activity.sh '{"ticket_id":7001,"start_datetime":"2026-06-06T10:00:00Z","end_datetime":"2026-06-06T11:00:00Z","description":"Fixed issue"}'
curl -s -X POST \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${1:?json body required}" \
  "${PHOENIX_API_BASE_URL}/api/v1/activities/create"
