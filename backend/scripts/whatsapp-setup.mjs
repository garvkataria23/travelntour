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
const TOKEN = env.WHATSAPP_ACCESS_TOKEN || "";
const WABA = env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const PHONE = env.WHATSAPP_PHONE_NUMBER_ID || "";
const PIN = env.WHATSAPP_REGISTRATION_PIN || "000000";
const VERSION = env.WHATSAPP_API_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

// Variable order is fixed by backend seed: customer_name, pnr, flight_number,
// from, to, date, time, terminal  ->  {{1}}..{{8}} (ascending, contiguous).
const TRAVEL_TEMPLATES = [
  {
    name: "booking_confirmation",
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Hi {{1}} 👋\n\nYour flight booking has been confirmed! ✈️\n\n🧾 PNR: {{2}}\n✈️ Flight: {{3}}\n🛫 From: {{4}}\n🛬 To: {{5}}\n🗓️ Date: {{6}}\n⏱️ Time: {{7}}\nTerminal: {{8}}\n\nWe wish you a safe and pleasant journey! 😊\nTeam Aurashine Travels" },
    ],
  },
  {
    name: "reminder_48h",
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Hi {{1}},\n\nYour flight is in 48 hours! ✈️\n\n🧾 PNR: {{2}}\n✈️ Flight: {{3}}\n🛫 From: {{4}}\n🛬 To: {{5}}\n🗓️ Date: {{6}}\n⏱️ Time: {{7}}\n\nKindly complete web check-in to save time at the airport.\nTeam Aurashine Travels" },
    ],
  },
  {
    name: "reminder_24h",
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Hi {{1}},\n\nYour flight is tomorrow! 🛫\n\n🧾 PNR: {{2}}\n✈️ Flight: {{3}}\n🛫 From: {{4}}\n🛬 To: {{5}}\n🗓️ Date: {{6}}\n⏱️ Time: {{7}}\nTerminal: {{8}}\n\nDon't forget to check-in online.\nTeam Aurashine Travels" },
    ],
  },
  {
    name: "journey_day",
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Hi {{1}},\n\nWishing you a safe journey! ✨\n\n🧾 PNR: {{2}}\n✈️ Flight: {{3}}\n🛫 From: {{4}}\n🛬 To: {{5}}\n🗓️ Date: {{6}}\n⏱️ Time: {{7}}\nTerminal: {{8}}\n\nHave a wonderful trip! 😊\nTeam Aurashine Travels" },
    ],
  },
  {
    name: "booking_cancellation",
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Hi {{1}},\n\nYour booking (PNR: {{2}}) has been cancelled. ✈️\n\n✈️ Flight: {{3}}\n🛫 From: {{4}}\n🛬 To: {{5}}\n🗓️ Date: {{6}}\n⏱️ Time: {{7}}\nTerminal: {{8}}\n\nIf you have any questions, please reply to this message.\nTeam Aurashine Travels" },
    ],
  },
];

function die(msg, code = 1) {
  console.error(`\n[whatsapp-setup] ${msg}`);
  process.exit(code);
}

function requireToken() {
  if (!TOKEN) die("WHATSAPP_ACCESS_TOKEN is empty. Fill it in backend/.env (Meta Developer -> App -> WhatsApp -> API Setup).");
}
function requireWaba() {
  requireToken();
  if (!WABA) die("WHATSAPP_BUSINESS_ACCOUNT_ID is empty in backend/.env.");
}
function requirePhone() {
  requireWaba();
  if (!PHONE) die("WHATSAPP_PHONE_NUMBER_ID is empty. Run `node scripts/whatsapp-setup.mjs phone` once a token is set, then copy the id into backend/.env.");
}

async function graph(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error;
    throw new Error(`Graph API ${res.status} ${err ? `(${err.code}/${err.error_subcode ?? ""}) ${err.message}` : JSON.stringify(data)}`);
  }
  return data;
}

async function phones() {
  requireWaba();
  const data = await graph("GET", `/${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,nuance_verification_status`);
  console.log("\nPhone numbers on WABA " + WABA + ":");
  if (!data.data?.length) console.log("  (none)");
  for (const p of data.data) {
    console.log(`  id=${p.id}  +${p.display_phone_number}  ${p.verified_name ?? "?"}  [${p.code_verification_status ?? "?"}]  quality=${p.quality_rating ?? "?"}`);
  }
  console.log("\n-> Copy the matching `id` into backend/.env as WHATSAPP_PHONE_NUMBER_ID");
}

async function listTemplates() {
  requireWaba();
  const data = await graph("GET", `/${WABA}/message_templates?limit=100&fields=name,status,category,language`);
  console.log("\nMessage templates:");
  if (!data.data?.length) console.log("  (none)");
  for (const t of data.data) {
    console.log(`  ${t.name}  [${t.status}]  ${t.category}  ${t.language}`);
  }
}

async function createTemplates() {
  requireWaba();
  for (const tpl of TRAVEL_TEMPLATES) {
    try {
      const data = await graph("POST", `/${WABA}/message_templates`, {
        name: tpl.name,
        language: tpl.language,
        category: tpl.category,
        components: tpl.components,
      });
      console.log(`created ${tpl.name} -> id ${data.id ?? "?"}`);
    } catch (err) {
      console.error(`  ${tpl.name}: ${err.message}`);
    }
  }
  console.log("\nTrack approval with: node scripts/whatsapp-setup.mjs check");
}

async function checkTemplates() {
  requireWaba();
  for (const tpl of TRAVEL_TEMPLATES) {
    try {
      const data = await graph("GET", `/${WABA}/message_templates?name=${tpl.name}&fields=name,status,category,language`);
      const rows = (data.data ?? []).filter((t) => t.language === "en");
      if (!rows.length) console.log(`${tpl.name}: NOT FOUND`);
      else for (const t of rows) console.log(`${tpl.name}: [${t.status}] ${t.category}`);
    } catch (err) {
      console.error(`  ${tpl.name}: ${err.message}`);
    }
  }
  console.log("\nOnly APPROVED templates can be sent.");
}

async function subscribe() {
  requirePhone();
  const result = {};
  try { result.waba = await graph("POST", `/${WABA}/subscribed_apps`); }
  catch (err) { result.waba = { error: err.message }; }
  try { result.phone = await graph("POST", `/${PHONE}/subscribed_apps`); }
  catch (err) { result.phone = { error: err.message }; }
  console.log("WABA subscribed_apps:", JSON.stringify(result.waba));
  console.log("Phone subscribed_apps:", JSON.stringify(result.phone));
  console.log("\nThen in Meta Developer -> App -> WhatsApp -> Configuration save webhook fields (messages, message_template_status_update, ...).");
}

async function register() {
  requirePhone();
  const data = await graph("POST", `/${PHONE}/register`, { messaging_product: "whatsapp", pin: PIN });
  console.log("register:", JSON.stringify(data));
}

async function probe() {
  requirePhone();
  const data = await graph("GET", `/${PHONE}?fields=platform_type,display_phone_number,verified_name,quality_rating,code_verification_status`);
  console.log(JSON.stringify(data, null, 2));
}

async function sendTest(to) {
  requirePhone();
  if (!to) die("Provide a recipient number, e.g. node scripts/whatsapp-setup.mjs send-test 919876543210");
  const data = await graph("POST", `/${PHONE}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "booking_confirmation",
      language: { code: "en" },
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
  console.log("Sent ->", JSON.stringify(data));
}

const [cmd, arg] = process.argv.slice(2);
const commands = {
  phone: phones,
  templates: listTemplates,
  create: createTemplates,
  check: checkTemplates,
  subscribe,
  register,
  probe,
  "send-test": () => sendTest(arg),
};

if (!cmd || !commands[cmd]) {
  console.log("Usage: node scripts/whatsapp-setup.mjs <command> [arg]");
  console.log("Commands: phone, templates, create, check, subscribe, register, probe, send-test <number>");
  process.exit(0);
}

commands[cmd]().catch((err) => {
  console.error(err.message);
  process.exit(1);
});