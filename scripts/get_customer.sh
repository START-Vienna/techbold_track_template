#!/usr/bin/env bash
# Usage: ./get_customer.sh <customer_id>
curl -s -X GET \
  -H "Authorization: Bearer ${PHOENIX_API_TOKEN}" \
  "${PHOENIX_API_BASE_URL}/api/v1/customers/${1:?customer_id required}"
