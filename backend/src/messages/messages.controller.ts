import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { SendManualMessageDto } from './dto/send-manual-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @RequirePermissions(Permission.WHATSAPP_VIEW_MESSAGES)
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.messagesService.list(user, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.WHATSAPP_VIEW_MESSAGES)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messagesService.get(user, id);
  }

  // Sends a real outbound message on the tenant's WhatsApp number. Throttled per user as well as
  // globally, because the only other ceiling is the monthly tenant quota — one user could otherwise
  // burn the whole month's allowance in a burst.
  @Post()
  @RequirePermissions(Permission.WHATSAPP_SEND)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  send(@CurrentUser() user: AuthUser, @Body() dto: SendManualMessageDto) {
    return this.messagesService.sendManual(user, dto);
  }

  // Re-enqueues a failed message. Separate from sending because retrying can resend content that
  // already went out once.
  @Post(':id/retry')
  @RequirePermissions(Permission.WHATSAPP_RETRY)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messagesService.retry(user, id);
  }
}