# Shopify Automation WhatsApp Templates

Used by the `whatsapp_template` nodes in the automated Shopify flows. Names below are
hard-coded in the app's flow definitions (`main.rs`), so create these EXACT names in the
same WABA. All are references your Shopify store's product/brand.

Create each by POSTing to `https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`.

## abandoned_cart_1 (MARKETING) - sent ~6h after cart creation

```json
{
  "name": "abandoned_cart_1",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "You left something behind {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYou still have {{3}} items worth {{4}} in your cart. Want to grab them before they're gone?\n\nContinue your order here: {{5}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Back to cart", "url": "https://{{5}}" } ] },
    { "type": "FOOTER", "text": "Reply STOP to opt out of offers." }
  ]
}
```

## abandoned_cart_2 (MARKETING) - sent ~24h after cart creation

```json
{
  "name": "abandoned_cart_2",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Your cart is waiting {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYour cart with {{3}} items ({{4}}) is still waiting for you. Checkout is quick:\n\n{{5}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Complete order", "url": "https://{{5}}" } ] },
    { "type": "FOOTER", "text": "Reply STOP to opt out of offers." }
  ]
}
```

## abandoned_cart_3 (MARKETING) - sent ~42h after cart creation (last chance)

```json
{
  "name": "abandoned_cart_3",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Final call {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nThis is your last chance to complete your order of {{3}} items ({{4}}) before your cart is cleared.\n\nFinish checkout: {{5}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Finish checkout", "url": "https://{{5}}" } ] },
    { "type": "FOOTER", "text": "Reply STOP to opt out of offers." }
  ]
}
```

## order_confirmation (UTILITY)

```json
{
  "name": "order_confirmation",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Order confirmed {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYour order {{3}} for {{4}} has been confirmed.\n\nOrder total: {{5}}\nEstimated delivery: {{6}}" },
    { "type": "FOOTER", "text": "Track updates via the link above." }
  ]
}
```

## payment_confirmation (UTILITY)

```json
{
  "name": "payment_confirmation",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Payment received {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nWe've received your payment of {{3}} for order {{4}}.\n\nThank you for shopping with us!" }
  ]
}
```

## cod_confirmation (UTILITY)

```json
{
  "name": "cod_confirmation",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Order on the way {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYour order {{3}} ({{4}}) will be delivered Cash on Delivery.\n\nKeep {{5}} ready at delivery. Thanks!" }
  ]
}
```

## order_shipped (UTILITY)

```json
{
  "name": "order_shipped",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Your order has shipped {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nOrder {{3}} has shipped!\n\nTracking: {{4}}\nCourier: {{5}}\nETA: {{6}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Track order", "url": "https://{{4}}" } ] }
  ]
}
```

## delivery_followup (UTILITY) - after delivery confirmation event

```json
{
  "name": "delivery_followup",
  "language": "en",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Did you get your order {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nYour order {{3}} was marked delivered today. Did everything arrive safely?\n\nReply YES or describe any issue and we'll help right away." }
  ]
}
```

## review_request (MARKETING) - request product feedback

```json
{
  "name": "review_request",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Love to hear your thoughts {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nHow's your {{3}} from order {{4}}? If you have a moment, a quick review helps us a lot:\n\n{{5}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Write a review", "url": "https://{{5}}" } ] },
    { "type": "FOOTER", "text": "Reply STOP to opt out." }
  ]
}
```

## reorder_reminder (MARKETING)

```json
{
  "name": "reorder_reminder",
  "language": "en",
  "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Time to reorder {{1}}" },
    { "type": "BODY", "text": "Hi {{2}},\n\nIt's been a while since you ordered {{3}}. Likely time to restock:\n\n{{4}}" },
    { "type": "BUTTONS", "buttons": [ { "type": "URL", "text": "Reorder now", "url": "https://{{4}}" } ] },
    { "type": "FOOTER", "text": "Reply STOP to opt out." }
  ]
}
```

## Notes

- In the app flow definitions these templates are wired to triggers: cart created ->
  `abandoned_cart_1` -> wait 6h -> `abandoned_cart_2` -> wait 18h -> `abandoned_cart_3` ->
  stop. Order/payment/shipping nodes fire on the corresponding Shopify webhooks.
- Use exactly `en` as the language code in `template.language.code` when sending (the nodes
  hard-code `"language": "en"`).