# WhatsApp Flows

WhatsApp Flows let customers book an appointment *inside* the chat without leaving WhatsApp.

Env vars that control it:
- `WHATSAPP_BOOKING_FLOW_ID` - the Flow id (from Flow Manager).
- `WHATSAPP_BOOKING_FLOW_LAYOUT` - set to `appointment` (drives the bot layout expectations).
- `WHATSAPP_FLOW_PRIVATE_KEY` / `WHATSAPP_FLOW_PRIVATE_KEY_PATH` - RSA private key used to
  sign the JWT that decrypts/authenticates flow responses. Keep ONLY one of the two set.

## Setup steps

1. Create the Flow: Meta Business Suite -> WhatsApp Manager -> Flow tab -> Create flow.
   Paste `booking-flow-layout.json` (or build from the palette). Publish it, then copy the
   Flow ID into `WHATSAPP_BOOKING_FLOW_ID`.
2. Generate a signing key pair (RS256):
   openssl genpkey -algorithm RSA -out wa-flow-private-key.pem -pkeyopt rsa_keygen_bits:2048
   openssl rsa -in wa-flow-private-key.pem -pubout -out wa-flow-public-key.pem
3. Upload the public key in the Flow settings under "Decryption key" (Meta calls it a
   signing key on their side). Put the private key path in `WHATSAPP_FLOW_PRIVATE_KEY_PATH`.
4. Send the flow as a template with a body component that carries a `flow` payload + the
   encrypted request token (see `flow-signing-example.js`).
5. Handle the `flow_resume` callback in the webhook: decrypt the `action` payload with the
   private key (RS256, use `nbf`/`iat`, verify the `signature`), then trigger
   `WHATSAPP_BOOKING_FLOW_ID` booking logic (branch/service/staff/date/time/confirm -> create
   appointment).

## Flow message example (template type=flow not used; flows are sent via templates or interactive)

Flows are delivered through message templates whose body declares
`type: flow` and carries the flow payload + encrypted request token. The layout includes a
data payload matching `WHATSAPP_BOOKING_FLOW_LAYOUT=appointment`.

## Payload encryption / request-token

Meta signs each `flow_resume` payload with the private key you upload. Your server must:
- split `signature`, `paypload` (base64url, JSON), `iv`, `tag` in the body parameter,
- verify `signature` is an RS256 JWT of the payload using the PUBLIC key you uploaded
  (Meta signs the decrypted payload),
- AES-256-CBC decrypt `paypload` with `iv`/`tag` using the private key's derived key setting.

`flow-signing-example.js` shows the exact Node.js flow used by the app for the decrypt path.