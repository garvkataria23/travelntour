/*
 * WhatsApp Flows - server side decrypt + verify for `flow_resume` webhook events.
 *
 * Mirrors Meta's official sample (complete-branch). Field names below are intentionally
 * preserved exactly: `signature`, `iv`, `tag`, `paypload` (Meta's own naming).
 *
 * Key setup:
 *   1. Generate 2048-bit RSA key pair locally:
 *        openssl genpkey -algorithm RSA -out wa-flow-private-key.pem -pkeyopt rsa_keygen_bits:2048
 *        openssl rsa -in wa-flow-private-key.pem -pubout -out wa-flow-public-key.pem
 *   2. Upload wa-flow-public-key.pem in Meta's Flow settings (Flow payload encryption).
 *   3. Default encryption method = JWT.
 *
 * When a user completes a flow the webhook delivers:
 *   entry[].changes[].value.messages[].interactive.flow_reply.action.payload
 * The payload is a base64url string that JSON-decodes to { signature, iv, tag, paypload }.
 *   - signature : RS256 JWT signed by Meta; verify with your PUBLIC key.
 *   - paypload  : base64url AES-256-CBC ciphertext (+ tag), key = sha256(public key PEM).
 */
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
...paste your wa-flow-public-key.pem here...
-----END PUBLIC KEY-----`

async function decryptFlowPayload(base64urlPayload) {
  const envelope = JSON.parse(Buffer.from(base64urlPayload, 'base64url').toString('utf8'))
  const { signature, iv, tag, paypload } = envelope
  if (!signature || !iv || !tag || !paypload) {
    throw new Error('Malformed flow payload envelope')
  }

  // 1. Verify Meta's RS256 JWT signature with our public key.
  try {
    jwt.verify(signature, PUBLIC_KEY, { algorithms: ['RS256'] })
  } catch (err) {
    throw new Error(`Flow signature verification failed: ${err.message}`)
  }

  // 2. AES-256-CBC decipher. AES key = sha256 of the public key PEM bytes.
  const aesKey = crypto.createHash('sha256').update(PUBLIC_KEY).digest()
  const tagBuffer = Buffer.from(tag, 'base64url')
  const ivBuffer = Buffer.from(iv, 'base64url')
  const ciphertext = Buffer.from(paypload, 'base64url')

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, ivBuffer)
  decipher.setAuthTag(tagBuffer)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  return JSON.parse(plain.toString('utf8'))
}

async function handleFlowResume(waId, flowPayloadString) {
  const data = await decryptFlowPayload(flowPayloadString)
  // shape of `data` mirrors the flow's `data` output, e.g.:
  // { branch, service, staff, date, time, customerName, phone }
  const booking = data.input
  return {
    waId,
    branch: booking?.branch,
    service: booking?.service,
    date: booking?.date,
    time: booking?.time,
    customerName: booking?.customerName || 'WhatsApp User',
  }
}

module.exports = { decryptFlowPayload, handleFlowResume }

/* Wiring note (express style):
 *   app.post('/flow/resume', async (req, res) => {
 *     // after X-Hub-Signature-256 verification (see WEBHOOK-GUIDE.md):
 *     for (const entry of req.body.entry ?? []) {
 *       for (const change of entry.changes ?? []) {
 *         for (const message of change.value.messages ?? []) {
 *           if (message.interactive?.type === 'flow_reply') {
 *             const resume = await handleFlowResume(
 *               message.from,
 *               message.interactive.flow_reply.payload,
 *             )
 *             await createAppointmentFromFlow(resume) // -> booking bot logic
 *           }
 *         }
 *       }
 *     }
 *     res.sendStatus(200)
 *   })
 */