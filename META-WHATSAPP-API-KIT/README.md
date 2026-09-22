# Meta WhatsApp Cloud API Kit

Everything needed to connect your other app to the Meta WhatsApp Business Cloud API
using the *verified* Solastio Meta account.

Account state: fully verified / production-ready. The two values that must be pulled from
the Meta dashboard and pasted into `.env` are `META_WABA_PHONE_NUMBER_ID` and
`META_WHATSAPP_TOKEN`.

## Contents

| File / folder         | Purpose |
|-----------------------|---------|
| `.env`                | Real secrets from the working Solastio app. Copy to your new app. |
| `.env.example`        | Same structure, blanks. Share / commit safe. |
| `META-ACCOUNT-SUMMARY.md` | Every credential id and where to copy each one from in the Meta dashboard. |
| `API-GUIDE.md`        | Full Graph API endpoint + payload reference (send, templates, subscribe, register, OAuth). |
| `WEBHOOK-GUIDE.md`    | Webhook URL, verify token, signature check, fields, reconciliation. |
| `templates/`          | Full WhatsApp message template definitions (create + send payloads) for salon & Shopify flows. |
| `flows/`              | WhatsApp Flows config (booking flow layout JSON + JWT signing). |

## Quick start

1. Copy `.env` into your new app root.
2. Fill the two blank values (see `META-ACCOUNT-SUMMARY.md` -> "You must fetch these"):
   - `META_WABA_PHONE_NUMBER_ID` -> Meta Business Suite -> WhatsApp -> WhatsApp Manager -> phone number -> Phone number ID.
   - `META_WHATSAPP_TOKEN` -> Meta Developer -> App -> WhatsApp -> API Setup -> permanent token (or system-user token).
4. Optional: create the templates in `templates/` against the WABA via `API-GUIDE.md`.

## Security

- `.env` is git-ignored by the `.gitignore` in this folder, but the folder still lives inside
  `D:\Documents\SOLASTIO`. Do NOT commit or push it.
- Rotate `META_APP_SECRET`, `META_CREDENTIAL_ENCRYPTION_KEY`, and the WhatsApp token if this
  folder ever leaves your machine.
- Note: `META_CREDENTIAL_ENCRYPTION_KEY` decrypts tokens stored in the database. If you change
  it, all stored WhatsApp/Shopify connection tokens will no longer decrypt.