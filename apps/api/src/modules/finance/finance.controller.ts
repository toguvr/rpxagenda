import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createExpenseRequestSchema,
  createPaymentRequestSchema,
  createRecurringExpenseRequestSchema,
  financeSummaryQuerySchema,
  listExpensesQuerySchema,
  listPaymentsQuerySchema,
  updateExpenseRequestSchema,
  updatePaymentRequestSchema,
  updateRecurringExpenseRequestSchema,
  UserRole,
  type CreateExpenseRequest,
  type CreatePaymentRequest,
  type CreateRecurringExpenseRequest,
  type ExpenseResponse,
  type FinanceSummaryQuery,
  type FinanceSummaryResponse,
  type GenerateRecurringExpenseResponse,
  type ListExpensesQuery,
  type ListPaymentsQuery,
  type PaymentResponse,
  type RecurringExpenseResponse,
  type UpdateExpenseRequest,
  type UpdatePaymentRequest,
  type UpdateRecurringExpenseRequest,
  ScreenKey,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { Screen } from '../auth/decorators/screen.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';
import { RecurringExpensesService } from './recurring-expenses.service';
import {
  CreateExpenseDto,
  CreatePaymentDto,
  CreateRecurringExpenseDto,
  ExpenseResponseDto,
  FinanceSummaryResponseDto,
  PaymentResponseDto,
  RecurringExpenseResponseDto,
  UpdateExpenseDto,
  UpdatePaymentDto,
  UpdateRecurringExpenseDto,
} from './dto/finance.dto';

/** Contexto financeiro — acesso restrito a ADMIN (CLAUDE.md §6). */
@ApiTags('finance')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Screen(ScreenKey.FINANCE)
@Controller()
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly recurring: RecurringExpensesService,
  ) {}

  // ---------- Resumo ----------

  @Get('finance/summary')
  @ApiOperation({ summary: 'Resumo financeiro do período (default: mês corrente).' })
  @ApiOkResponse({ type: FinanceSummaryResponseDto })
  summary(
    @Query(new ZodValidationPipe(financeSummaryQuerySchema)) q: FinanceSummaryQuery,
  ): Promise<FinanceSummaryResponse> {
    return this.finance.summary(q);
  }

  // ---------- Pagamentos ----------

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra um recebimento (manual). Auditado.' })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  createPayment(
    @Body(new ZodValidationPipe(createPaymentRequestSchema)) body: CreatePaymentRequest,
  ): Promise<PaymentResponse> {
    return this.finance.createPayment(body);
  }

  @Get('payments')
  @ApiOperation({
    summary: 'Lista recebimentos com filtros (status, método, paciente, plano, datas).',
  })
  @ApiOkResponse({ type: PaymentResponseDto, isArray: true })
  listPayments(
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) q: ListPaymentsQuery,
  ): Promise<PaymentResponse[]> {
    return this.finance.listPayments(q);
  }

  @Get('patients/:patientId/payments')
  @ApiOperation({ summary: 'Histórico financeiro de um paciente.' })
  @ApiOkResponse({ type: PaymentResponseDto, isArray: true })
  listForPatient(@Param('patientId') patientId: string): Promise<PaymentResponse[]> {
    return this.finance.listPaymentsForPatient(patientId);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Detalhe de um recebimento.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  getPayment(@Param('id') id: string): Promise<PaymentResponse> {
    return this.finance.getPayment(id);
  }

  @Patch('payments/:id')
  @ApiOperation({ summary: 'Edita um recebimento (valor, método, status, datas). Auditado.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  updatePayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentRequestSchema)) body: UpdatePaymentRequest,
  ): Promise<PaymentResponse> {
    return this.finance.updatePayment(id, body);
  }

  @Delete('payments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um recebimento. Auditado.' })
  @ApiNoContentResponse()
  deletePayment(@Param('id') id: string): Promise<void> {
    return this.finance.deletePayment(id);
  }

  // ---------- Despesas ----------

  @Post('expenses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lança uma despesa. Auditado.' })
  @ApiCreatedResponse({ type: ExpenseResponseDto })
  createExpense(
    @Body(new ZodValidationPipe(createExpenseRequestSchema)) body: CreateExpenseRequest,
  ): Promise<ExpenseResponse> {
    return this.finance.createExpense(body);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Lista despesas com filtros (categoria, datas).' })
  @ApiOkResponse({ type: ExpenseResponseDto, isArray: true })
  listExpenses(
    @Query(new ZodValidationPipe(listExpensesQuerySchema)) q: ListExpensesQuery,
  ): Promise<ExpenseResponse[]> {
    return this.finance.listExpenses(q);
  }

  @Patch('expenses/:id')
  @ApiOperation({ summary: 'Edita uma despesa. Auditado.' })
  @ApiOkResponse({ type: ExpenseResponseDto })
  updateExpense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseRequestSchema)) body: UpdateExpenseRequest,
  ): Promise<ExpenseResponse> {
    return this.finance.updateExpense(id, body);
  }

  @Delete('expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma despesa. Auditado.' })
  @ApiNoContentResponse()
  deleteExpense(@Param('id') id: string): Promise<void> {
    return this.finance.deleteExpense(id);
  }

  // ---------- Gastos fixos (despesas recorrentes) ----------

  @Post('recurring-expenses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria um gasto fixo (despesa recorrente). Auditado.' })
  @ApiCreatedResponse({ type: RecurringExpenseResponseDto })
  createRecurring(
    @Body(new ZodValidationPipe(createRecurringExpenseRequestSchema))
    body: CreateRecurringExpenseRequest,
  ): Promise<RecurringExpenseResponse> {
    return this.recurring.create(body);
  }

  @Get('recurring-expenses')
  @ApiOperation({ summary: 'Lista os gastos fixos da unidade.' })
  @ApiOkResponse({ type: RecurringExpenseResponseDto, isArray: true })
  listRecurring(): Promise<RecurringExpenseResponse[]> {
    return this.recurring.findMany();
  }

  @Patch('recurring-expenses/:id')
  @ApiOperation({ summary: 'Edita um gasto fixo. Auditado.' })
  @ApiOkResponse({ type: RecurringExpenseResponseDto })
  updateRecurring(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurringExpenseRequestSchema))
    body: UpdateRecurringExpenseRequest,
  ): Promise<RecurringExpenseResponse> {
    return this.recurring.update(id, body);
  }

  @Delete('recurring-expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um gasto fixo (despesas já geradas permanecem). Auditado.' })
  @ApiNoContentResponse()
  deleteRecurring(@Param('id') id: string): Promise<void> {
    return this.recurring.remove(id);
  }

  @Post('recurring-expenses/:id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gera/recupera a despesa do mês corrente deste gasto fixo.' })
  generateRecurring(@Param('id') id: string): Promise<GenerateRecurringExpenseResponse> {
    return this.recurring.generateNow(id);
  }

  static _swaggerHints: [
    CreatePaymentDto,
    UpdatePaymentDto,
    CreateExpenseDto,
    UpdateExpenseDto,
    CreateRecurringExpenseDto,
    UpdateRecurringExpenseDto,
  ] = [
    {} as CreatePaymentDto,
    {} as UpdatePaymentDto,
    {} as CreateExpenseDto,
    {} as UpdateExpenseDto,
    {} as CreateRecurringExpenseDto,
    {} as UpdateRecurringExpenseDto,
  ];
}
