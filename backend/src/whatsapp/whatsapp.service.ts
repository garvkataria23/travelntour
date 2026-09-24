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
}

export interface SendDocumentParams {
  to: string;
  document: Buffer;
  fileName: string;
  caption?: string;
}

export interface SendTextParams {
  to: string;
  body: string;
}

export interface SendResult {
  waMessageId: string;
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

  get configured(): boolean {
    return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    if (!this.configured) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.language },
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

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      this.throwMetaError(body);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId };
  }

  async sendText(params: SendTextParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    if (!this.configured) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
      this.throwMetaError(body);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId };
  }

  async sendDocument(params: SendDocumentParams): Promise<SendResult> {
    if (this.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { waMessageId: `mock_${Math.random().toString(36).slice(2, 12)}` };
    }
    if (!this.configured) {
      throw new WhatsAppApiError(
        'NOT_CONFIGURED',
        'WhatsApp API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or enable WHATSAPP_MOCK.',
        false,
      );
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
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
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
        body: form,
      });
      uploadBody = (await uploadRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!uploadRes.ok) {
        this.throwMetaError(uploadBody);
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
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
      this.throwMetaError(body);
    }

    const messages = body.messages as Array<{ id: string }> | undefined;
    const waMessageId = messages?.[0]?.id;
    if (!waMessageId) {
      throw new WhatsAppApiError('INVALID_RESPONSE', 'WhatsApp API returned no message id', false);
    }
    return { waMessageId };
  }

  private throwMetaError(body: Record<string, unknown>): never {
    const error = body.error as Record<string, unknown> | undefined;
    const subcode = error?.error_subcode as number | undefined;
    const codeRaw = Number(error?.code) || Number(subcode);
    const mapped = META_ERROR_CODES[codeRaw] ?? {
      code: 'TEMPORARY_ERROR',
      retryable: true,
    };
    const message = (error?.message as string) || 'WhatsApp API request failed';
    throw new WhatsAppApiError(mapped.code, message, mapped.retryable, codeRaw);
  }
}