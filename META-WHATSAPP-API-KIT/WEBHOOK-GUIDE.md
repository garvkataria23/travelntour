# WhatsApp Webhook Guide

## Callback URL

- Route: `POST /webhook` (and `GET /webhook` for verification).
- Register it at: Meta Developer -> App -> WhatsApp -> Configuration -> Webhook.
  - Callback URL: `https://your-domain.com/webhook`
  - Verify token: `META_WEBHOOK_VERIFY_TOKEN` (here: `solastio-whatsapp-verify-2026`)
- After saving, click "Manage" and subscribe the fields listed in section "Fields".

## Verification handshake (GET)

```
GET /webhook?hub.mode=subscribe&hub.verify_token=solastio-whatsapp-verify-2026&hub.challenge=1158201444
```
Expected behaviour (mirrors `whatsapp_verify_webhook` in the app):
- If `mode == "subscribe"`, `hub.verify_token` equals the configured webhook verify token,
  return `200` with the raw `hub.challenge` in the body.
- Otherwise return `403`.

## Signature validation (POST)

Every webhook POST must carry header `X-Hub-Signature-256`:
```
X-Hub-Signature-256: sha256=a1b2...
```
Verify with the app secret (`META_WEBHOOK_APP_SECRET`, same as `META_APP_SECRET`):

```
computed = HMAC_SHA256(raw_request_body, app_secret)
expected = header value after "sha256="
timing-safe equality of computed hex == expected
```
Reject (`403`) when it does not match. The app implements this in `verify_meta_signature`.

## Example inbound payload (message)

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "1396409985151927",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "1095013691845001"
            },
            "contacts": [ { "profile": { "name": "Priya" }, "wa_id": "919876543210" } ],
            "messages": [
              {
                "from": "919876543210",
                "id": "wamid.ABC123",
                "timestamp": "1720000000",
                "text": { "body": "hi" },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

## Example inbound payload (delivery status)

```json
{
  "value": {
    "messaging_product": "whatsapp",
    "metadata": { "display_phone_number": "15551234567", "phone_number_id": "1095013691845001" },
    "statuses": [
      {
        "id": "wamid.ABC123",
        "status": "delivered",
        "timestamp": "1720000000",
        "recipient_id": "919876543210",
        "conversation": { "id": "CONVOID", "expiration_timestamp": "1720086400", "origin": { "type": "service" } },
        "pricing": { "billable": "true", "pricing_model": "CBP", "category": "service" }
      }
    ]
  },
  "field": "messages"
}
```
The app maps statuses: `sent`, `delivered`, `read`, `failed` (+ `errors[0]` incl. code/message)
back onto the outbound row by `providerMessageId`.

## Fields to subscribe

- `messages` (required — inbound text, interactive replies, statuses)
- `message_template_status_update` (template approval → lets you auto-fill template catalog)
- `message_template_quality_update`
- `message_deliveries`, `message_reads` (optional granularity)
- `phone_number_quality_update`, `account_update` (health)

## Conversation / window rules

- Templates can be sent any time (billed per business-initiated conversation).
- Free-form text requires an open 24h customer-service window (after the user messages you)
  or a user reply to a template; otherwise you must use a template.
- The booking bot runs inside the 24h window (user initiated); nudges use templates or are
  sent as text only inside an open window.

## Idempotency / dedupe

Every outbound has `metadata.dedupeKey`. Webhook statuses are applied by message id so a
delivered/read/failed event cannot double-apply. Rejected signature = dropped.

## Troubleshooting

1. Callback URL returns `403` -> wrong verify token, or GET handler not returning raw challenge.
2. No events arriving -> app not subscribed to the WABA/phone: run the "subscribe" flow
   (`subscribe_waba_to_webhooks` + `subscribe_phone_number_to_webhooks`), or re-save fields
   on the app subscription.
3. `X-Hub-Signature-256` mismatch -> app secret mismatch; confirm `META_WEBHOOK_APP_SECRET`
   equals the app secret and the raw body (not the parsed JSON) is used for the HMAC.