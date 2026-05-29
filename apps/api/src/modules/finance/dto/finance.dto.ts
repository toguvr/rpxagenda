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
  @ApiProperty() balanceCents!: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) byMethod!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) byExpenseCategory!: unknown[];
  @ApiProperty() paymentsCount!: number;
  @ApiProperty() expensesCount!: number;
}
