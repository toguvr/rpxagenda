import { ApiProperty } from '@nestjs/swagger';

const STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export class CreateAppointmentDto {
  @ApiProperty() patientId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: string;
  @ApiProperty({ type: String, isArray: true, default: [] }) equipmentIds?: string[];
}

export class CancelAppointmentDto {
  @ApiProperty({ required: false }) reason?: string;
}

export class AppointmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ nullable: true }) professionalId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ enum: STATUSES }) status!: string;
  @ApiProperty() consumedSession!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) checkedInAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) cancelledAt!: Date | null;
  @ApiProperty({ nullable: true }) cancelledById!: string | null;
  @ApiProperty({ nullable: true }) cancellationReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revertedAt!: Date | null;
  @ApiProperty({ nullable: true }) revertedById!: string | null;
  @ApiProperty({ type: String, isArray: true }) equipmentIds!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
