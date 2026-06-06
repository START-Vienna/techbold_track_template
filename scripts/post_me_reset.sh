#!/usr/bin/env bash
curl -s -X POST \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  "${PHOENIX_API_BASE_URL}/api/v1/me/reset"
