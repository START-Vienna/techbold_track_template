#!/usr/bin/env bash
# Usage: ./get_ticket_customer_system.sh <ticket_id>
curl -s -X GET \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  "${PHOENIX_API_BASE_URL}/api/v1/tickets/${1:?ticket_id required}/customer-system"
