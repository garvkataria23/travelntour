import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateInvoiceItemDto, SetPaymentDto, UpdateInvoiceItemDto } from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermissions(Permission.INVOICE_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      paymentStatus?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    return this.invoicesService.list(user, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.INVOICE_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.get(user, id);
  }

  @Get(':id/pdf')
  @RequirePermissions(Permission.INVOICE_VIEW_PDF)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getPdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.getPdf(user, id);
  }

  // Every mutation below moves money, so each maps to a distinct permission rather than sharing
  // one blanket "is admin" check. In particular RECORD_PAYMENT is separated from EDIT_ITEMS
  // because recording revenue is a different kind of authority from correcting a line.
  @Post(':id/issue')
  @RequirePermissions(Permission.INVOICE_ISSUE)
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.issue(user, id);
  }

  @Post(':id/items')
  @RequirePermissions(Permission.INVOICE_EDIT_ITEMS)
  addItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateInvoiceItemDto) {
    return this.invoicesService.addItem(user, id, dto);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(Permission.INVOICE_EDIT_ITEMS)
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInvoiceItemDto,
  ) {
    return this.invoicesService.updateItem(user, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(Permission.INVOICE_EDIT_ITEMS)
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.invoicesService.removeItem(user, id, itemId);
  }

  @Patch(':id/payment')
  @RequirePermissions(Permission.INVOICE_RECORD_PAYMENT)
  setPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPaymentDto) {
    return this.invoicesService.setPayment(user, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions(Permission.INVOICE_SEND)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  sendViaWhatsApp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.sendViaWhatsApp(user, id);
  }
}