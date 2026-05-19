import { ApiProperty } from '@nestjs/swagger';

export class CreateBusinessHoursDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=domingo .. 6=sábado' })
  weekday!: number;
  @ApiProperty({ example: '08:00' }) opensAt!: string;
  @ApiProperty({ example: '12:00' }) closesAt!: string;
}

export class BusinessHoursResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() weekday!: number;
  @ApiProperty() opensAt!: string;
  @ApiProperty() closesAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class CreateScheduleExceptionDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-12-25' }) date!: string;
  @ApiProperty({ enum: ['CLOSED', 'CUSTOM'] }) type!: string;
  @ApiProperty({ required: false, example: '14:00' }) opensAt?: string;
  @ApiProperty({ required: false, example: '18:00' }) closesAt?: string;
  @ApiProperty({ required: false }) reason?: string;
}

export class ScheduleExceptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ type: String, format: 'date' }) date!: Date;
  @ApiProperty({ enum: ['CLOSED', 'CUSTOM'] }) type!: string;
  @ApiProperty({ nullable: true }) opensAt!: string | null;
  @ApiProperty({ nullable: true }) closesAt!: string | null;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class SlotDto {
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ example: '08:00' }) localStart!: string;
  @ApiProperty({ example: '08:50' }) localEnd!: string;
}

export class SlotsResponseDto {
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() serviceId!: string;
  @ApiProperty({ type: SlotDto, isArray: true }) slots!: SlotDto[];
}
