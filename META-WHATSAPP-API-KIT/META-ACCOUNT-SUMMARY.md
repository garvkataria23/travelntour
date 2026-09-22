# Meta Account Summary (Verified)

Everything about the verified Meta business + WhatsApp account, and exactly where each
value comes from in the Meta dashboards.

## Credentials

| Env var                  | Value               | Where to find it                                                   |
|--------------------------|---------------------|--------------------------------------------------------------------|
| `META_APP_ID`            | `1739408257311822`  | Meta Developer -> Apps -> <App> -> App settings -> App ID          |
| `META_APP_SECRET`        | `0e720a77d76798055ff3e300610fc523` | Same page -> App secret (regenerate = invalidates old) |
| `META_CONFIG_ID`         | `1010803698681845`  | Business Manager -> Business Settings -> WhatsApp accounts -> under the WABA, "Configuration"        |
| `META_WABA_ID`           | `1396409985151927`  | WhatsApp Manager -> Account settings -> WhatsApp business account ID |
| `META_API_VERSION`       | `v21.0`             | Current stable Graph API version (kept in sync with code)          |
| `META_GRAPH_API_BASE_URL`| `https://graph.facebook.com` | Fixed                                                     |
| `META_GRAPH_API_VERSION` | `v21.0`             | Fixed                                                             |
| `VERIFY_TOKEN`           | `solastio-whatsapp-verify-2026` | You choose it; must match the webhook config exactly         |
| `META_WEBHOOK_VERIFY_TOKEN` | `solastio-whatsapp-verify-2026` | Same as above                               |
| `META_WEBHOOK_APP_SECRET`| `0e720a77d76798055ff3e300610fc523` | Same value as app secret                    |
| `META_CREDENTIAL_ENCRYPTION_KEY` | `TotvO8w4TQIP0tFP1qpSz6jL3SkV6XltAF_oKk7nhNM` | 32-byte AES key used to encrypt stored OAuth tokens. Generate new with `openssl rand -base64 32` if re-keying. |

## You must fetch these (not stored — pulled at connect time)

| Env var                  | Where to find it                                                   |
|--------------------------|--------------------------------------------------------------------|
| `META_WABA_PHONE_NUMBER_ID` | Meta Business Suite -> WhatsApp Manager -> phone number (the verified sender number) -> "Phone number ID". |
| `META_WHATSAPP_TOKEN`    | (a) Meta Developer -> App -> WhatsApp -> API Setup -> "Permanent token", or (b) better: a system-user token — Business Manager -> Business Settings -> System users -> create user with app + WhatsApp relationship -> "Generate token". |

Note on the token: the app supports both a static `META_WHATSAPP_TOKEN` and OAuth-based
tokens fetched during Embedded Signup connect and stored encrypted in the DB. When using
the static env token, ensure the system user / app user has `whatsapp_business_messaging`
and `whatsapp_business_management` permissions and the WABA is shared with the app in the
Business app settings.

## Resource IDs you can read live from the API (no dashboard needed)

```
GET {base}/{version}/{WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating
 Authorization: Bearer {META_WHATSAPP_TOKEN}
```

```
GET {base}/{version}/{WABA_ID}/message_templates
GET {base}/{version}/{WABA_ID}/business_account_info
GET {base}/{version}/{META_WABA_ID}/assigned_users
```

## Verified / production state

- Phone number display & verification status visible via the phone_numbers endpoint above.
- `code_verification_status` should be VERIFIED for the sender number.
- To send customer-initiated marketing templates the business needs "Marketing" category
  approval; utilities normally auto-approve. Confirm template statuses via the
  `message_templates` endpoint.

## Warnings

- `META_WHATSAPP_TOKEN` and `META_APP_SECRET` are the two most dangerous values. If leaked,
  rotate them from the developer dashboard only.
- Changing `META_CREDENTIAL_ENCRYPTION_KEY` breaks decryption of previously stored OAuth
  tokens (expected format: base64url iv + ciphertext + tag).