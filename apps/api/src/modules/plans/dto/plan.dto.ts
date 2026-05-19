import { ApiProperty } from '@nestjs/swagger';

export class CreatePackagePlanDto {
  @ApiProperty({ enum: ['PACKAGE'] }) type!: 'PACKAGE';
  @ApiProperty() patientId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ example: 20 }) totalSessions!: number;
  @ApiProperty({ type: String, format: 'date', example: '2026-09-30' }) validUntil!: string;
  @ApiProperty({ type: String, format: 'date-time', required: false }) startsAt?: string;
}

export class CreateSubscriptionPlanDto {
  @ApiProperty({ enum: ['SUBSCRIPTION'] }) type!: 'SUBSCRIPTION';
  @ApiProperty() patientId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ example: 3, description: 'agendamentos por semana' }) weeklyQuota!: number;
  @ApiProperty({ type: String, format: 'date-time', required: false }) startsAt?: string;
}

export class UpdatePlanStatusDto {
  @ApiProperty({
    enum: ['PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
  })
  status!: string;
  @ApiProperty({ required: false }) reason?: string;
}

export class PlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ enum: ['PACKAGE', 'SUBSCRIPTION'] }) type!: string;
  @ApiProperty({
    enum: ['PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
  })
  status!: string;
  @ApiProperty({ nullable: true }) totalSessions!: number | null;
  @ApiProperty({ nullable: true }) remainingSessions!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) validUntil!: Date | null;
  @ApiProperty({ nullable: true }) weeklyQuota!: number | null;
  @ApiProperty({ nullable: true, required: false }) weeklyUsage?: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endsAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
