import { Body, Controller, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { UnauthorizedWebhookError } from './webhook-unauthorized.error';
import { WebhookService } from './webhook.service';

@ApiTags('whatsapp')
@ApiExcludeController()
@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Meta webhook verification handshake.
   */
  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && this.webhookService.isValidToken(token)) {
      res.type('text/plain').send(challenge);
      return;
    }
    throw new UnauthorizedWebhookError();
  }

  /**
   * WhatsApp status update events (sent / delivered / read / failed).
   * Verifies the X-Hub-Signature-256 header and always acknowledges Meta so it
   * does not retry harmful payloads.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  async events(
    @Req() req: Request,
    @Body() event: Record<string, unknown>,
  ) {
    if (!this.webhookService.isValidSignature((req as unknown as { rawBody?: Buffer }).rawBody, req.header('x-hub-signature-256'))) {
      this.logger.warn('Webhook rejected: invalid signature');
      throw new UnauthorizedWebhookError();
    }
    if (!event || typeof event !== 'object') {
      return { received: true };
    }
    try {
      const handled = await this.webhookService.handleEvent(event);
      if (!handled) {
        this.logger.debug('Webhook payload contained no handled events');
      }
    } catch (error) {
      this.logger.error(`Webhook processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { received: true };
  }
}