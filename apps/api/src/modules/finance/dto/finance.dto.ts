import { ApiProperty } from '@nestjs/swagger';

const PAYMENT_METHODS = [
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CASH',
  'BOLETO',
  'BANK_TRANSFER',
  'OTHER',
];
const PAYMENT_STATUSES = ['PAID', 'PENDING', 'REFUNDED', 'FAILED'];
const EXPENSE_CATEGORIES = [
  'RENT',
  'PAYROLL',
  'SUPPLIES',
  'EQUIPMENT',
  'UTILITIES',
  'TAXES',
  'MARKETING',
  'OTHER',
];

export class CreatePaymentDto {
  @ApiProperty({ required: false }) planId?: string;
  @ApiProperty({ required: false }) patientId?: string;
  @ApiProperty({ example: 120000, description: 'valor em centavos' }) amountCents!: number;
  @ApiProperty({ enum: PAYMENT_METHODS }) method!: string;
  @ApiProperty({ enum: PAYMENT_STATUSES, required: false, default: 'PAID' }) status?: string;
  @ApiProperty({ type: String, format: 'date-time', required: false }) paidAt?: string;
  @ApiProperty({ type: String, format: 'date-time', required: false }) dueAt?: string;
  @ApiProperty({ required: false }) description?: string;
  @ApiProperty({ required: false }) notes?: string;
}

export class UpdatePaymentDto {
  @ApiProperty({ required: false }) amountCents?: number;
  @ApiProperty({ enum: PAYMENT_METHODS, required: false }) method?: string;
  @ApiProperty({ enum: PAYMENT_STATUSES, required: false }) status?: string;
  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true }) paidAt?:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true }) dueAt?:
    | string
    | null;
  @ApiProperty({ required: false, nullable: true }) description?: string | null;
  @ApiProperty({ required: false, nullable: true }) notes?: string | null;
}

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ nullable: true }) planId!: string | null;
  @ApiProperty({ nullable: true }) patientId!: string | null;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ enum: PAYMENT_METHODS }) method!: string;
  @ApiProperty({ enum: PAYMENT_STATUSES }) status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: Date | null;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) pagarmeChargeId!: string | null;
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ nullable: true, required: false }) patientName?: string | null;
  @ApiProperty({ nullable: true, required: false }) serviceName?: string | null;
}

export class CreateExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category!: string;
  @ApiProperty({ example: 350000, description: 'valor em centavos' }) amountCents!: number;
  @ApiProperty({ type: String, format: 'date-time' }) paidAt!: string;
  @ApiProperty({ required: false }) description?: string;
  @ApiProperty({ required: false }) notes?: string;
}

export class UpdateExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES, required: false }) category?: string;
  @ApiProperty({ required: false }) amountCents?: number;
  @ApiProperty({ type: String, format: 'date-time', required: false }) paidAt?: string;
  @ApiProperty({ required: false }) description?: string;
  @ApiProperty({ required: false }) notes?: string;
}

export class ExpenseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ type: String, format: 'date-time' }) paidAt!: Date;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty({ nullable: true }) recurringExpenseId!: string | null;
  @ApiProperty({ nullable: true }) period!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class CreateRecurringExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category!: string;
  @ApiProperty({ example: 350000, description: 'valor em centavos' }) amountCents!: number;
  @ApiProperty({ minimum: 1, maximum: 28, description: 'dia do mês (1–28)' }) dayOfMonth!: number;
  @ApiProperty({ default: false }) variableAmount?: boolean;
  @ApiProperty({ default: true }) active?: boolean;
  @ApiProperty({ required: false }) description?: string;
  @ApiProperty({ required: false }) notes?: string;
}

export class UpdateRecurringExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES, required: false }) category?: string;
  @ApiProperty({ required: false }) amountCents?: number;
  @ApiProperty({ required: false, minimum: 1, maximum: 28 }) dayOfMonth?: number;
  @ApiProperty({ required: false }) variableAmount?: boolean;
  @ApiProperty({ required: false }) active?: boolean;
  @ApiProperty({ required: false }) description?: string;
  @ApiProperty({ required: false }) notes?: string;
}

export class RecurringExpenseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() dayOfMonth!: number;
  @ApiProperty() variableAmount!: boolean;
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true }) lastGeneratedPeriod!: string | null;
  @ApiProperty({ nullable: true }) createdById!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class FinanceSummaryResponseDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() receivedCents!: number;
  @ApiProperty() pendingCents!: number;
  @ApiProperty() overdueCents!: number;
  @ApiProperty() expensesCents!: number;
  @ApiProperty() fixedMonthlyCents!: number;
  @ApiProperty() balanceCents!: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) byMethod!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) byExpenseCategory!: unknown[];
  @ApiProperty() paymentsCount!: number;
  @ApiProperty() expensesCount!: number;
}
