#!/usr/bin/env bash
curl -s -X GET \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  "${PHOENIX_API_BASE_URL}/api/v1/me"
