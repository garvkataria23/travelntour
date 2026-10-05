export class WhatsAppApiError extends Error {
  code: string;
  retryable: boolean;
  status?: number;

  constructor(code: string, message: string, retryable = false, status?: number) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  language: string;
  bodyVariables: string[];
  phoneNumberId?: string;
}

export interface SendDocumentParams {
  to: string;
  document: Buffer;
  fileName: string;
  caption?: string;
  phoneNumberId?: string;
}

export interface SendTextParams {
  to: string;
  body: string;
  phoneNumberId?: string;
}

export interface SendResult {
  waMessageId: string;
  phoneNumberId?: string;
}

const META_ERROR_CODES: Record<number, { code: string; retryable: boolean }> = {
  100: { code: 'AUTH_ERROR', retryable: false },
  190: { code: 'AUTH_ERROR', retryable: false },
  131026: { code: 'NUMBER_NOT_WHATSAPP', retryable: false },
  131047: { code: 'RE_ENGAGEMENT_ERROR', retryable: false },
  132000: { code: 'TEMPLATE_PARAMETER_ERROR', retryable: false },
  470: { code: 'RATE_LIMIT', retryable: true },
  130429: { code: 'RATE_LIMIT', retryable: true },
  80007: { code: 'NUMBER_NOT_REGISTERED', retryable: false },
  131031: { code: 'TEMPLATE_ERROR', retryable: false },
  132001: { code: 'TEMPLATE_UNAVAILABLE', retryable: false },
  131030: { code: 'FREE_FORM_WINDOW', retryable: false },
  132005: { code: 'TEMPLATE_PAUSED', retryable: false },
  131008: { code: 'SEND_LIMIT_REACHED', retryable: true },
};

export class WhatsAppService {
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';

  get mockMode(): boolean {
    return process.env.WHATSAPP_MOCK === 'true';
  }

  /**
   * Resolves the sender Phone Number ID:
   * 1. Explicit per-call override (`params.phoneNumberId`: 'primary' | 'secondary' | '<id>')
   * 2. `WHATSAPP_ACTIVE_SENDER` ('primary' | 'secondary' | '<id>') if set
   * 3. Default `WHATSAPP_PHONE_NUMBER_ID` (primary number: 1372700039251498)
   */
  resolvePhoneNumberId(override?: string): string {
    const primary = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const secondary = process.env.WHATSAPP_SECONDARY_PHONE_NUMBER_ID || '';
    const target = (override || process.env.WHATSAPP_ACTIVE_SENDER || 'primary').trim();

    if (target.toLowerCase() === 'secondary' && secondary) {
      return secondary;
    }
    if (target.toLowerCase() === 'primary') {
      return primary;
    }
    if (/^\d+$/.test(target)) {
      return target;
    }
    return primary;
  }

  resolveAccessToken(resolvedPhoneId?: string): string {
    const secondaryId = process.env.WHATSAPP_SECONDARY_PHONE_NUMBER_ID || '';
    const secondaryToken = process.env.WHATSAPP_SECONDARY_ACCESS_TOKEN || '';
    if (resolvedPhoneId && secondaryId && resolvedPhoneId === secondaryId && secondaryToken) {
      return secondaryToken;
    }
    return process.env.WHATSAPP_ACCESS_TOKEN || '';
  }

  get availableSenderIds(): { primary: string; secondary: string; active: string } {
    return {
      primary: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      secondary: process.env.WHATSAPP_SECONDARY_PHONE_NUMBER_ID || '',
      active: this.resolvePhoneNumberId(),
    };
  }

  get configured(): boolean {
    const phoneId = this.resolvePhoneNumberId();
    return Boolean(this.resolveAccessToken(phoneId) && phoneId);
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    const phoneNumberId = this.resolvePhoneNumberId(params.phoneNumberId);
    const token = this.resolveAccessToken(phoneNumberId);
    if (!token || !phoneNumberId) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    let usedPhoneNumberId = phoneNumberId;

    const sendAttempt = async (tplName: string, lang: string, targetPhoneId = phoneNumberId, targetToken = token): Promise<Response> => {
      const targetUrl = `https://graph.facebook.com/${this.apiVersion}/${targetPhoneId}/messages`;
      try {
        return await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${targetToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: params.to,
            type: 'template',
            template: {
              name: tplName,
              language: { code: lang },
              components: [
                {
                  type: 'body',
                  parameters: params.bodyVariables.map((value) => ({ type: 'text', text: String(value) })),
                },
              ],
            },
          }),
        });
      } catch (error) {
        throw new WhatsAppApiError(
          'NETWORK_ERROR',
          `Failed to reach WhatsApp API: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
    };

    let response = await sendAttempt(params.templateName, params.language);
    let body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok && Number((body.error as Record<string, unknown> | undefined)?.code) === 132001) {
      const candidates: Array<{ name: string; lang: string }> = [];
      const altLang = params.language === 'en' ? 'en_US' : params.language === 'en_US' ? 'en' : null;
      if (altLang) {
        candidates.push({ name: params.templateName, lang: altLang });
      }
      if (params.templateName === 'booking_confirm_enus') {
        candidates.push({ name: 'booking_confirmation', lang: 'en_US' }, { name: 'booking_confirmation', lang: 'en' });
      } else if (params.templateName === 'booking_confirmation') {
        candidates.push({ name: 'booking_confirm_enus', lang: 'en_US' });
      }
      for (const cand of candidates) {
        response = await sendAttempt(cand.name, cand.lang);
        body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok || Number((body.error as Record<string, unknown> | undefined)?.code) !== 132001) {
          break;
        }
      }

      // If secondary WABA templates are still PENDING Meta approval (132001),
      // fall back to primary sender if configured so customer messages are never dropped.
      const primaryId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
      const primaryToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
      if (
        !response.ok &&
        Number((body.error as Record<string, unknown> | undefined)?.code) === 132001 &&
        primaryId &&
        primaryToken &&
        phoneNumberId !== primaryId &&
        process.env.WHATSAPP_DISABLE_PRIMARY_FALLBACK !== 'true'
      ) {
        usedPhoneNumberId = primaryId;
        response = await sendAttempt(params.templateName, params.language, primaryId, primaryToken);
        body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      }
    }

    if (!response.ok) {
      this.throwMetaError(body, response.status, response.headers);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId, phoneNumberId: usedPhoneNumberId };
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    const phoneNumberId = this.resolvePhoneNumberId(params.phoneNumberId);
    const token = this.resolveAccessToken(phoneNumberId);
    if (!token || !phoneNumberId) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'text',
          text: { body: params.body },
        }),
      });
    } catch (error) {
      throw new WhatsAppApiError(
        'NETWORK_ERROR',
        `Failed to reach WhatsApp API: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      this.throwMetaError(body, response.status, response.headers);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId, phoneNumberId };
  }

  async sendDocument(params: SendDocumentParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    const phoneNumberId = this.resolvePhoneNumberId(params.phoneNumberId);
    const token = this.resolveAccessToken(phoneNumberId);
    if (!token || !phoneNumberId) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    const baseUrl = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}`;

    // Step 1: upload the document to obtain a media id.
    let uploadBody: Record<string, unknown>;
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', 'document');
      const blob = new Blob([new Uint8Array(params.document)], { type: 'application/pdf' });
      form.append('file', blob, params.fileName);
      const uploadRes = await fetch(`${baseUrl}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      uploadBody = (await uploadRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!uploadRes.ok) {
        this.throwMetaError(uploadBody, uploadRes.status, uploadRes.headers);
      }
    } catch (error) {
      if (error instanceof WhatsAppApiError) throw error;
      throw new WhatsAppApiError(
        'NETWORK_ERROR',
        `Failed to upload document to WhatsApp API: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    const mediaId = uploadBody.id as string | undefined;
    if (!mediaId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no media id', false);
    }

    // Step 2: send the document message.
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'document',
          document: {
            id: mediaId,
            filename: params.fileName,
            ...(params.caption ? { caption: params.caption } : {}),
          },
        }),
      });
    } catch (error) {
      throw new WhatsAppApiError(
        'NETWORK_ERROR',
        `Failed to reach WhatsApp API: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      this.throwMetaError(body, response.status, response.headers);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId };
  }

  private throwMetaError(body: Record<string, unknown>, httpStatus?: number, headers?: Headers): never {
    const error = body.error as Record<string, unknown> | undefined;
    const subcode = error?.error_subcode as number | undefined;
    const codeRaw = Number(error?.code) || Number(subcode);
    const isMetaRateLimit = codeRaw === 470 || codeRaw === 130429 || codeRaw === 131008 || httpStatus === 429;
    const isServerError = httpStatus !== undefined && httpStatus >= 500 && httpStatus <= 504;

    const mapped = META_ERROR_CODES[codeRaw];
    const retryable = mapped ? mapped.retryable : (isMetaRateLimit || isServerError);
    const code = mapped ? mapped.code : (isMetaRateLimit ? 'RATE_LIMIT' : (isServerError ? 'TEMPORARY_ERROR' : 'API_ERROR'));

    let message = (error?.message as string) || 'WhatsApp API request failed';
    const retryAfter = headers?.get?.('retry-after');
    if (retryAfter) {
      message += ` (Retry-After: ${retryAfter}s)`;
    }
    throw new WhatsAppApiError(code, message, retryable, codeRaw || httpStatus);
  }
}