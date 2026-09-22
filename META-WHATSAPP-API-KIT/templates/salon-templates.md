# Salon WhatsApp Message Templates

Create each one by POSTing to `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`
with the JSON bodies below (see API-GUIDE.md). Component text can be edited to match your
salon branding; keep placeholder counts in sync with the body/header text.

Names MUST match what the app sends (campaigns reference `templateName`; the Shopify
automation nodes reference the names in `shopify-templates.json`).

## appointment_confirmation (UTILITY)

```json
{
  "name": "appointment_confirmation",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Your booking is confirmed {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nThanks for booking with us!\n\nService : {{3}}\nDate    : {{4}}\nTime    : {{5}}\nStaff   : {{6}}\nBranch  : {{7}}\n\nBooking ID: {{8}}\n\nTo reschedule or cancel, reply to this message." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## appointment_reminder (UTILITY)

```json
{
  "name": "appointment_reminder",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Reminder {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nJust a friendly reminder about your appointment:\n\nService : {{3}}\nDate    : {{4}}\nTime    : {{5}}\nBranch  : {{6}}\n\nSee you soon! Reply BOOK to book another service or RESCHEDULE to change this one." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## appointment_rebooking (UTILITY)

```json
{
  "name": "appointment_rebooking",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "It's been a while {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYou last visited us for {{3}} on {{4}}. Would love to see you again!\n\nReply BOOK and I'll find you the next available slot." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## payment_required_hold (UTILITY) - deposit payment link for Razorpay holds

```json
{
  "name": "payment_required_hold",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Complete payment to hold your slot {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYour booking for {{3}} on {{4}} at {{5}} is on hold. Pay {{6}} within 15 minutes to confirm.\n\nPay here: {{7}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Pay now", "url": "https://{{7}}" } ] },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## waitlist_offer (UTILITY)

```json
{
  "name": "waitlist_offer",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "A slot just opened {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nA spot for {{3}} on {{4}} at {{5}} just opened up.\n\nReply BOOK within 15 minutes to claim it." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## feedback_request (MARKETING)

```json
{
  "name": "feedback_request",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "How was your visit {{1}}?" },
    { "type": "BODY", "text": "Hi {{2}},\n\nWe hope you enjoyed your {{3}} session. We'd love your feedback!\n\nReply GREAT / OK / POOR, or send a message with your thoughts." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## birthday_offer (MARKETING)

```json
{
  "name": "birthday_offer",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Happy Birthday {{1}}!!" },
    { "type": "BODY", "text": "Hi {{2}},\n\nTo celebrate, enjoy {{3}} off any service with us this month.\n\nShow this message at the counter. Reply BOOK to schedule your visit." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## loyalty_reward (MARKETING)

```json
{
  "name": "loyalty_reward",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "You earned a reward {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYou've collected {{3}} loyalty points. Redeem them for a free service on your next visit.\n\nReply BOOK to use them." },
    { "type": "FOOTER", "text": "Aura Shine Salon & Wellness" }
  ]
}
```

## Notice

- Keep `category` accurate: UTILITY for transactional, MARKETING for promotional. Wrong
  category risks rejection or tier changes.
- All marketing sends respect the per-customer opt-out (`marketingOptOut`); the API refuses
  to send marketing to a customer who replied OPT OUT.
- After approval, copy each template's name into your campaign UI / template catalog so
  `templateName` in campaign sends matches exactly.