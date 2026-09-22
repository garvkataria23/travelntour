# Message Templates

| File | Contents |
|------|----------|
| `salon-templates.md` | Salon flow templates (appointment confirm/reminder/rebooking, deposit hold, waitlist, feedback, birthday, loyalty) as full `POST {WABA_ID}/message_templates` bodies. |
| `shopify-templates.md` | Shopify automation templates with the EXACT names hard-coded in the app flows: `abandoned_cart_1/2/3`, `order_confirmation`, `payment_confirmation`, `cod_confirmation`, `order_shipped`, `delivery_followup`, `review_request`, `reorder_reminder`. |
| `send-examples.json` | Ready-to-send payloads for `POST {PHONE_NUMBER_ID}/messages`: template (with/without body params), free-text, interactive buttons, interactive list, and 24h-window threaded reply. |

## Workflow

1. POST each template body to `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`.
2. Watch approval: `GET {WABA_ID}/message_templates?name={NAME}&fields=name,status,category,language`.
3. Once `status == APPROVED`, capture the exact name into your campaign template catalog so
   campaign/flow sends use matching `templateName` + language code (`en`).

## Always check

- Category accuracy: UTILITY (transactional) vs MARKETING (promotional). Wrong category can
  block approval or raise messaging tier usage.
- Placeholders: body `{{1}}`... count must match the `parameters` array you send
  (App sends only body parameters; headers/buttons have no placeholders at send time).
- Language code `en` matches the template's language.