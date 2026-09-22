# Meta WhatsApp Cloud API Reference

Base URL: `https://graph.facebook.com`
Default version: `v21.0`
Full message endpoint: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`

Auth: `Authorization: Bearer {META_WHATSAPP_TOKEN}` for all endpoints below unless stated.

## 1. Send a template message (24h window NOT required)

```
POST /v21.0/{PHONE_NUMBER_ID}/messages
```
```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "appointment_reminder",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Aura Shine" },
          { "type": "text", "text": "2026-09-25 10:30" },
          { "type": "text", "text": "Hair Spa" }
        ]
      }
    ]
  }
}
```
Response: `{ "messages": [ { "id": "wamid.HBg..." } ] }`. The id is saved as the outbound
provider message id.

## 2. Send a free-form text message (requires 24h open window)

```
POST /v21.0/{PHONE_NUMBER_ID}/messages
```
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "text",
  "text": { "body": "Hello from Solastio" }
}
```

## 3. Send an interactive message (buttons / list reply)

```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Confirm your booking?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "confirm", "title": "Yes, book!" } },
        { "type": "reply", "reply": { "id": "decline", "title": "No thanks" } }
      ]
    }
  }
}
```
List picker (used by the booking bot to pick branch / staff / service):
```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "Choose a branch" },
    "body": { "text": "Where do you want to visit?" },
    "action": {
      "button": "Select",
      "sections": [
        {
          "title": "Branches",
          "rows": [
            { "id": "br-1", "title": "Aura Shine - Baner", "description": "7:30 AM - 9 PM" },
            { "id": "br-2", "title": "Aura Shine - Koregaon", "description": "9 AM - 8:30 PM" }
          ]
        }
      ]
    }
  }
}
```

## 4. Create a message template

```
POST /v21.0/{WABA_ID}/message_templates
```
```json
{
  "name": "appointment_reminder",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Reminder from {{1}}" },
    { "type": "BODY", "text": "Hi {{1}}, this is a reminder for your appointment at {{2}}. See you at {{3}}!" },
    { "type": "FOOTER", "text": "Reply OPT OUT to stop marketing messages." },
    { "type": "BUTTONS", "buttons": [
      { "type": "URL", "text": "View status", "url": "https://{{1}}/status" }
    ]}
  ]
}
```
Send approval: GET to check status:
```
GET /v21.0/{WABA_ID}/message_templates?name=appointment_reminder&fields=name,status,category,language,components
```
Status `APPROVED` = usable. `PENDING`/`REJECTED` need action in the Manager.

## 5. List / search templates

```
GET /v21.0/{WABA_ID}/message_templates?limit=50&fields=name,status,category,language
```

## 6. Get template (by template id)

```
GET /v21.0/{TEMPLATE_ID}
```

## 7. Delete a template

```
DELETE /v21.0/{WABA_ID}/message_templates?name={NAME}
```

## 8. Subscribe app to WABA + phone number (webhook delivery)

```
POST /v21.0/{WABA_ID}/subscribed_apps
POST /v21.0/{PHONE_NUMBER_ID}/subscribed_apps
```
Returns `{ "success": true }` when the app is registered and will start receiving webhooks
for the given `messages` / `message_template_status_update` / `message_template_quality_update`
fields. The code marks the connection `webhookSubscribed` after both calls succeed.

## 9. Set webhook fields on the app

```
POST /v21.0/{APP_ID}/subscriptions
Content-Type: application/json
```
```json
{
  "object": "whatsapp_business_account",
  "fields": [
    { "field": "messages", "has_operation": true },
    { "field": "message_template_status_update", "has_operation": true },
    { "field": "message_template_quality_update", "has_operation": true },
    { "field": "account_update", "has_operation": true },
    { "field": "phone_number_quality_update", "has_operation": true },
    { "field": "message_deliveries", "has_operation": true },
    { "field": "message_reads", "has_operation": true }
  ]
}
```

## 10. List phone numbers on the WABA

```
GET /v21.0/{WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating
```

## 11. Register a WhatsApp phone number

```
POST /v21.0/{PHONE_NUMBER_ID}/register
```
```json
{ "messaging_product": "whatsapp", "pin": "000000" }
```
Uses `WHATSAPP_REGISTRATION_PIN` env var, default `000000`. Required before the number can
send/receive through the Cloud API if it was migrated, and for re-registering.

## 12. Probe platform type

```
GET /v21.0/{PHONE_NUMBER_ID}?fields=platform_type
```
Reports `CLOUD_API` / `ON_PREMISES` so the app knows which type is connected.

## 13. Embedded-session code exchange (OAuth from Embedded Signup UI)

```
GET /v21.0/oauth/access_token?client_id={APP_ID}&client_secret={APP_SECRET}&code={CODE}
```
(Optional `redirect_uri` if used.) Response `{ "access_token": "...", "expires_in": 3600 }`
is then stored encrypted via `encrypt_secret` (AES-256-GCM + HMAC, key =
`META_CREDENTIAL_ENCRYPTION_KEY`).

## 14. WABA discovery after connect

```
GET /v21.0/me/shared_whatsapp_business_accounts
GET /v21.0/me/businesses
GET /v21.0/{BUSINESS_ID}/owned_whatsapp_business_accounts
GET /v21.0/{WABA_ID}/phone_numbers
```

## 15. Token diagnostics / long-lived system user token (static)

Permanent token: Meta Developer -> App -> WhatsApp -> API Setup -> "Permanent token".
If you prefer a token pinned to a system user so it survives app ownership changes:
Business Manager -> Security -> System users -> Generate token with `whatsapp_business_management`
and `whatsapp_business_messaging` checked.

## 16. Get all phone numbers owned by the current token (fallback discovery)

```
GET /v21.0/{APP_ID}/whatsapp_business_accounts
GET /v21.0/me?fields=id,name
```

## Error format

```json
{
  "error": {
    "message": "Error message (#100)",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 2018108,
    "fbtrace_id": "..."
  }
}
```
Common subcodes seen in this app: `2018108` (not opted into messaging / phone number
quality issue), `132001` (message usage out of tier), `130429` (rate limit), `131026`
(message undeliverable). The app maps the top-level message into the outbound `error` field.