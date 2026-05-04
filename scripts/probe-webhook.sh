#!/usr/bin/env bash
# ============================================================================
# probe-webhook.sh — fire a synthetic Respond.io webhook against the live
# server end-to-end. Computes the HMAC-SHA256 base64 signature using
# RESPOND_IO_WEBHOOK_SECRET so the verifySignature() check passes.
#
# Usage:
#   ./scripts/probe-webhook.sh                        # default: client OW intent
#   ./scripts/probe-webhook.sh agent                  # espía path: agent reply
#   ./scripts/probe-webhook.sh client "Hola, info"    # client custom text
#   URL=http://localhost:3000 ./scripts/probe-webhook.sh   # local instead of prod
#
# Reads from the project's .env (RESPOND_IO_WEBHOOK_SECRET). Override with
# WEBHOOK_SECRET=... on the command line.
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC2046
    WEBHOOK_SECRET="$(grep -E '^RESPOND_IO_WEBHOOK_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  fi
fi
if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  echo "RESPOND_IO_WEBHOOK_SECRET not found in env or $ENV_FILE" >&2
  exit 1
fi

URL="${URL:-https://dpmserver-production.up.railway.app}/webhook/respond-io"

MODE="${1:-client}"
shift || true

ts="$(date +%s)"
contact_id="probe-$$-$ts"
conv_id="probe-conv-$$-$ts"
msg_id="probe-msg-$$-$ts"

case "$MODE" in
  client)
    text="${1:-Hola, soy principiante y quiero hacer Open Water. Cuanto cuesta?}"
    body=$(cat <<JSON
{
  "event":"message.created",
  "direction":"incoming",
  "contact":{
    "id":"$contact_id",
    "phone":"+5491100000001",
    "name":"Probador Cliente",
    "language":"es",
    "customFields":{"Branch":"Gili Trawangan"},
    "tags":[]
  },
  "message":{
    "messageId":"$msg_id",
    "type":"text",
    "text":"$text"
  },
  "conversation":{"id":"$conv_id"}
}
JSON
)
    ;;
  agent)
    text="${1:-Hola! Te paso el link de pago en breve.}"
    agent="${2:-Grecia}"
    body=$(cat <<JSON
{
  "event":"message.created",
  "direction":"outgoing",
  "contact":{
    "id":"$contact_id",
    "phone":"+5491100000001",
    "name":"Cliente con espía",
    "language":"es",
    "customFields":{"Branch":"Gili Trawangan"},
    "tags":[]
  },
  "message":{
    "messageId":"$msg_id",
    "type":"text",
    "text":"$text",
    "direction":"outgoing",
    "sentBy":{"id":"agent-$agent","type":"agent","name":"$agent"}
  },
  "conversation":{"id":"$conv_id"}
}
JSON
)
    ;;
  *)
    echo "unknown mode: $MODE  (expected: client | agent)" >&2
    exit 2
    ;;
esac

# Compute base64 HMAC-SHA256 of the raw body using the secret.
sig="$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)"

echo "→ POST $URL  (mode=$MODE, msg=$msg_id)"
echo "→ x-respond-signature: $sig"
echo

curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "x-respond-signature: $sig" \
  -d "$body"
echo
