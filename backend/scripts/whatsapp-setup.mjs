// WhatsApp Cloud API setup helper (Meta Cloud API v21)
// Mirrors the workflow from the META-WHATSAPP-API-KIT.
//
// Usage (from backend/):
//   node scripts/whatsapp-setup.mjs phone          list phone numbers on the WABA (find PHONE_NUMBER_ID)
//   node scripts/whatsapp-setup.mjs templates      list existing message templates + status
//   node scripts/whatsapp-setup.mjs create         create the 5 travel templates (errors on dupes are fine)
//   node scripts/whatsapp-setup.mjs check          show approval status of the 5 travel templates
//   node scripts/whatsapp-setup.mjs subscribe      subscribe app to WABA + phone number (webhook delivery)
//   node scripts/whatsapp-setup.mjs register       register the phone number (pin 000000)
//   node scripts/whatsapp-setup.mjs probe          show platform_type etc. for the phone number
//   node scripts/whatsapp-setup.mjs send-test 919876543210   send booking_confirmation to a test recipient
//
// Requires WHATSAPP_ACCESS_TOKEN (and WHATSAPP_PHONE_NUMBER_ID for some commands)
// in backend/.env. Once token is set, `phone` reveals the missing phone-number id.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const out = { ...process.env };
  try {
    const raw = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !m[2].startsWith("#")) out[m[1]] = m[2];
    }
  } catch {
    /* no .env -> rely on process env */
  }
  return out;
}

const env = loadEnv();
const PRIMARY_TOKEN = env.WHATSAPP_ACCESS_TOKEN || "";
const SECONDARY_TOKEN = env.WHATSAPP_SECONDARY_ACCESS_TOKEN || PRIMARY_TOKEN;
const PRIMARY_WABA = env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const SECONDARY_WABA = env.WHATSAPP_SECONDARY_WABA_ID || PRIMARY_WABA;
const PRIMARY_PHONE = env.WHATSAPP_PHONE_NUMBER_ID || "";
const SECONDARY_PHONE = env.WHATSAPP_SECONDARY_PHONE_NUMBER_ID || "";
const ACTIVE_SENDER = (env.WHATSAPP_ACTIVE_SENDER || "primary").trim();
const IS_SECONDARY_ACTIVE = ACTIVE_SENDER.toLowerCase() === "secondary" && Boolean(SECONDARY_PHONE);
const PHONE = IS_SECONDARY_ACTIVE
  ? SECONDARY_PHONE
  : /^\d+$/.test(ACTIVE_SENDER)
    ? ACTIVE_SENDER
    : PRIMARY_PHONE;
const TOKEN = IS_SECONDARY_ACTIVE ? SECONDARY_TOKEN : PRIMARY_TOKEN;
const WABA = IS_SECONDARY_ACTIVE ? SECONDARY_WABA : PRIMARY_WABA;
const PIN = env.WHATSAPP_REGISTRATION_PIN || "000000";
const VERSION = env.WHATSAPP_API_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

function resolveTargetPhone(targetArg) {
  if (!targetArg) return PHONE;
  const t = String(targetArg).trim().toLowerCase();
  if (t === "primary") return PRIMARY_PHONE;
  if (t === "secondary") return SECONDARY_PHONE;
  return String(targetArg).trim();
}

function resolveTokenForPhone(phoneId) {
  if (phoneId && SECONDARY_PHONE && phoneId === SECONDARY_PHONE && SECONDARY_TOKEN) {
    return SECONDARY_TOKEN;
  }
  return PRIMARY_TOKEN;
}

function resolveWabaForTarget(targetArg) {
  const t = String(targetArg || ACTIVE_SENDER).trim().toLowerCase();
  if (t === "secondary" && SECONDARY_WABA) return SECONDARY_WABA;
  return PRIMARY_WABA;
}

// Variable order is fixed by backend seed: customer_name, pnr, flight_number,
// from, to, date, time, terminal  ->  {{1}}..{{8}} (ascending, contiguous).
const EXAMPLE_8_VARS = ["Rahul Sharma", "AI-201", "2001", "MUM", "DEL", "09 Oct 2026", "9:45 AM", "T2"];

const TRAVEL_TEMPLATES = [
  {
    name: "booking_confirmation",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}},\n\nYour flight booking has been confirmed!\n\nPNR: {{2}}\nFlight: {{3}}\nFrom: {{4}}\nTo: {{5}}\nDate: {{6}}\nTime: {{7}}\nTerminal: {{8}}\n\nWe wish you a safe and pleasant journey!\nTeam Blue Aura Tourism",
        example: { body_text: [EXAMPLE_8_VARS] },
      },
    ],
  },
  {
    name: "reminder_48h",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}},\n\nYour flight is in 48 hours!\n\nPNR: {{2}}\nFlight: {{3}}\nFrom: {{4}}\nTo: {{5}}\nDate: {{6}}\nTime: {{7}}\nTerminal: {{8}}\n\nKindly complete web check-in to save time at the airport.\nTeam Blue Aura Tourism",
        example: { body_text: [EXAMPLE_8_VARS] },
      },
    ],
  },
  {
    name: "reminder_24h",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}},\n\nYour flight is tomorrow!\n\nPNR: {{2}}\nFlight: {{3}}\nFrom: {{4}}\nTo: {{5}}\nDate: {{6}}\nTime: {{7}}\nTerminal: {{8}}\n\nDon't forget to check-in online.\nBlue Aura Tourism",
        example: { body_text: [EXAMPLE_8_VARS] },
      },
    ],
  },
  {
    name: "journey_day",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}},\n\nWishing you a safe journey!\n\nPNR: {{2}}\nFlight: {{3}}\nFrom: {{4}}\nTo: {{5}}\nDate: {{6}}\nTime: {{7}}\nTerminal: {{8}}\n\nHave a wonderful trip!\nTeam Blue Aura Tourism",
        example: { body_text: [EXAMPLE_8_VARS] },
      },
    ],
  },
  {
    name: "booking_cancellation",
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}},\n\nWe are sorry to inform you that your flight booking has been cancelled.\n\nBooking PNR: {{2}}\nFlight No: {{3}}\nFrom: {{4}}\nTo: {{5}}\nDeparture Date: {{6}}\nDeparture Time: {{7}}\nTerminal: {{8}}\n\nIf you have already paid, our team will process the refund within a few working days. For any questions about this cancellation or your refund, please reply to this message and our support team will assist you.\n\nThank you for your patience and understanding.\nTeam Blue Aura Tourism",
        example: { body_text: [EXAMPLE_8_VARS] },
      },
    ],
  },
];

function die(msg, code = 1) {
  console.error(`\n[whatsapp-setup] ${msg}`);
  process.exit(code);
}

function requireToken(tok = TOKEN) {
  if (!tok) die("WHATSAPP_ACCESS_TOKEN is empty. Fill it in backend/.env (Meta Developer -> App -> WhatsApp -> API Setup).");
}
function requireWaba(waba = WABA, tok = TOKEN) {
  requireToken(tok);
  if (!waba) die("WHATSAPP_BUSINESS_ACCOUNT_ID is empty in backend/.env.");
}
function requirePhone(targetPhone = PHONE) {
  requireToken(resolveTokenForPhone(targetPhone));
  if (!targetPhone) die("WHATSAPP_PHONE_NUMBER_ID is empty. Run `node scripts/whatsapp-setup.mjs phone` once a token is set, then copy the id into backend/.env.");
}

async function graph(method, path, body, tokenOverride = TOKEN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokenOverride}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error;
    throw new Error(`Graph API ${res.status} ${err ? `(${err.code}/${err.error_subcode ?? ""}) ${err.message}` : JSON.stringify(data)}`);
  }
  return data;
}

async function phones(targetArg) {
  const targetWaba = resolveWabaForTarget(targetArg);
  const targetTok = String(targetArg || ACTIVE_SENDER).trim().toLowerCase() === "secondary" ? SECONDARY_TOKEN : PRIMARY_TOKEN;
  requireWaba(targetWaba, targetTok);
  const data = await graph("GET", `/${targetWaba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,nuance_verification_status`, undefined, targetTok);
  console.log("\nPhone numbers on WABA " + targetWaba + ":");
  if (!data.data?.length) console.log("  (none)");
  for (const p of data.data) {
    const tag =
      p.id === PRIMARY_PHONE
        ? " [PRIMARY]"
        : p.id === SECONDARY_PHONE
          ? " [SECONDARY]"
          : "";
    const activeTag = p.id === PHONE ? " ★ ACTIVE" : "";
    console.log(`  id=${p.id}${tag}${activeTag}  +${p.display_phone_number}  ${p.verified_name ?? "?"}  [${p.code_verification_status ?? "?"}]  quality=${p.quality_rating ?? "?"}`);
  }
  console.log(`\nConfigured Primary:   ${PRIMARY_PHONE || "(none)"} (WABA: ${PRIMARY_WABA || "none"})`);
  console.log(`Configured Secondary: ${SECONDARY_PHONE || "(none)"} (WABA: ${SECONDARY_WABA || "none"})`);
  console.log(`Active Sender:        ${PHONE || "(none)"} (WHATSAPP_ACTIVE_SENDER=${ACTIVE_SENDER})`);
}

async function listTemplates(targetArg) {
  const targetWaba = resolveWabaForTarget(targetArg);
  const targetTok = String(targetArg || ACTIVE_SENDER).trim().toLowerCase() === "secondary" ? SECONDARY_TOKEN : PRIMARY_TOKEN;
  requireWaba(targetWaba, targetTok);
  const data = await graph("GET", `/${targetWaba}/message_templates?limit=100&fields=name,status,category,language`, undefined, targetTok);
  console.log(`\nMessage templates on WABA ${targetWaba}:`);
  if (!data.data?.length) console.log("  (none)");
  for (const t of data.data) {
    console.log(`  ${t.name}  [${t.status}]  ${t.category}  ${t.language}`);
  }
}

async function createTemplates(targetArg) {
  const targetWaba = resolveWabaForTarget(targetArg);
  const targetTok = String(targetArg || ACTIVE_SENDER).trim().toLowerCase() === "secondary" ? SECONDARY_TOKEN : PRIMARY_TOKEN;
  requireWaba(targetWaba, targetTok);
  console.log(`Creating travel templates on WABA ${targetWaba}...`);
  for (const tpl of TRAVEL_TEMPLATES) {
    try {
      const data = await graph("POST", `/${targetWaba}/message_templates`, {
        name: tpl.name,
        language: tpl.language,
        category: tpl.category,
        components: tpl.components,
      }, targetTok);
      console.log(`created ${tpl.name} -> id ${data.id ?? "?"}`);
    } catch (err) {
      console.error(`  ${tpl.name}: ${err.message}`);
    }
  }
  console.log("\nTrack approval with: node scripts/whatsapp-setup.mjs check [primary|secondary]");
}

async function checkTemplates(targetArg) {
  const targetWaba = resolveWabaForTarget(targetArg);
  const targetTok = String(targetArg || ACTIVE_SENDER).trim().toLowerCase() === "secondary" ? SECONDARY_TOKEN : PRIMARY_TOKEN;
  requireWaba(targetWaba, targetTok);
  console.log(`Checking templates on WABA ${targetWaba}:`);
  for (const tpl of TRAVEL_TEMPLATES) {
    try {
      const data = await graph("GET", `/${targetWaba}/message_templates?name=${tpl.name}&fields=name,status,category,language`, undefined, targetTok);
      const rows = (data.data ?? []).filter((t) => t.language === "en" || t.language === "en_US");
      if (!rows.length) console.log(`${tpl.name}: NOT FOUND`);
      else for (const t of rows) console.log(`${tpl.name} (${t.language}): [${t.status}] ${t.category}`);
    } catch (err) {
      console.error(`  ${tpl.name}: ${err.message}`);
    }
  }
  console.log("\nOnly APPROVED templates can be sent.");
}

async function subscribe(targetArg) {
  const targetPhone = resolveTargetPhone(targetArg);
  const targetWaba = resolveWabaForTarget(targetArg);
  const targetTok = resolveTokenForPhone(targetPhone);
  requirePhone(targetPhone);
  const result = {};
  try { result.waba = await graph("POST", `/${targetWaba}/subscribed_apps`, undefined, targetTok); }
  catch (err) { result.waba = { error: err.message }; }
  try { result.phone = await graph("POST", `/${targetPhone}/subscribed_apps`, undefined, targetTok); }
  catch (err) { result.phone = { error: err.message }; }
  console.log(`WABA (${targetWaba}) subscribed_apps:`, JSON.stringify(result.waba));
  console.log(`Phone (${targetPhone}) subscribed_apps:`, JSON.stringify(result.phone));
  console.log("\nThen in Meta Developer -> App -> WhatsApp -> Configuration save webhook fields (messages, message_template_status_update, ...).");
}

async function register(targetArg) {
  const targetPhone = resolveTargetPhone(targetArg);
  const targetTok = resolveTokenForPhone(targetPhone);
  requirePhone(targetPhone);
  const data = await graph("POST", `/${targetPhone}/register`, { messaging_product: "whatsapp", pin: PIN }, targetTok);
  console.log(`register (${targetPhone}):`, JSON.stringify(data));
}

async function probe(targetArg) {
  const idsToProbe = targetArg
    ? [ { label: targetArg.toUpperCase(), id: resolveTargetPhone(targetArg), waba: resolveWabaForTarget(targetArg), tok: resolveTokenForPhone(resolveTargetPhone(targetArg)) } ]
    : [
        ...(PRIMARY_PHONE ? [{ label: "PRIMARY", id: PRIMARY_PHONE, waba: PRIMARY_WABA, tok: PRIMARY_TOKEN }] : []),
        ...(SECONDARY_PHONE ? [{ label: "SECONDARY", id: SECONDARY_PHONE, waba: SECONDARY_WABA, tok: SECONDARY_TOKEN }] : []),
      ];

  for (const item of idsToProbe) {
    const isActive = item.id === PHONE;
    console.log(`\n=== [${item.label}] Phone Number ID: ${item.id} | WABA: ${item.waba} ${isActive ? "(★ CURRENTLY ACTIVE)" : "(STANDBY)"} ===`);
    try {
      const data = await graph("GET", `/${item.id}?fields=id,platform_type,display_phone_number,verified_name,quality_rating,code_verification_status,status,account_mode,throughput`, undefined, item.tok);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error probing as Phone Number ID (${item.id}): ${err.message}`);
      try {
        const wabaCheck = await graph("GET", `/${item.waba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`, undefined, item.tok);
        console.log(`-> WABA (${item.waba}) phone numbers:`, JSON.stringify(wabaCheck, null, 2));
      } catch (wabaErr) {
        console.error(`-> Error probing WABA (${item.waba}): ${wabaErr.message}`);
      }
      try {
        const dbg = await graph("GET", `/debug_token?input_token=${item.tok}&access_token=${encodeURIComponent(item.tok)}`, undefined, item.tok);
        console.log(`-> Token debug info:`, JSON.stringify(dbg.data, null, 2));
      } catch (dbgErr) {
        console.error(`-> Could not inspect token scopes: ${dbgErr.message}`);
      }
    }
  }
}

async function sendTest(to, senderArg) {
  const targetPhone = resolveTargetPhone(senderArg);
  const targetTok = resolveTokenForPhone(targetPhone);
  requirePhone(targetPhone);
  if (!to) die("Provide a recipient number, e.g. node scripts/whatsapp-setup.mjs send-test 919876543210 [primary|secondary|<phoneNumberId>]");
  console.log(`Sending test via Phone Number ID: ${targetPhone} -> to: ${to}`);
  const payload = (name, lang) => ({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: "Test Passenger" },
          { type: "text", text: "ABC123" },
          { type: "text", text: "AI-202" },
          { type: "text", text: "BOM" },
          { type: "text", text: "DEL" },
          { type: "text", text: "25 Sep 2026" },
          { type: "text", text: "10:30 AM" },
          { type: "text", text: "Terminal 2" },
        ],
      }],
    },
  });
  let data;
  try {
    data = await graph("POST", `/${targetPhone}/messages`, payload("booking_confirmation", "en_US"), targetTok);
  } catch {
    data = await graph("POST", `/${targetPhone}/messages`, payload("booking_confirm_enus", "en_US"), targetTok);
  }
  console.log("Sent ->", JSON.stringify(data));
}

const [cmd, arg, arg2] = process.argv.slice(2);
const commands = {
  phone: () => phones(arg),
  templates: () => listTemplates(arg),
  create: () => createTemplates(arg),
  check: () => checkTemplates(arg),
  subscribe: () => subscribe(arg),
  register: () => register(arg),
  probe: () => probe(arg),
  "send-test": () => sendTest(arg, arg2),
};

if (!cmd || !commands[cmd]) {
  console.log("Usage: node scripts/whatsapp-setup.mjs <command> [arg] [sender: primary|secondary|<id>]");
  console.log("Commands: phone [sender], templates [sender], create [sender], check [sender], subscribe [sender], register [sender], probe [sender], send-test <number> [sender]");
  process.exit(0);
}

commands[cmd]().catch((err) => {
  console.error(err.message);
  process.exit(1);
});