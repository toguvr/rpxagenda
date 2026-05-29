import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateProtocolDto {
  @ApiProperty() patientId!: string;
  @ApiProperty() professionalId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ required: false, description: 'Agendamento de avaliação de origem.' })
  appointmentId?: string;
  @ApiProperty({ example: 20 }) totalSessions!: number;
  @ApiProperty({ example: 2 }) sessionsPerWeek!: number;
  @ApiProperty({ example: 'Hérnia de disco L4-L5' }) diagnosis!: string;
  @ApiProperty({ required: false }) observations?: string;
  @ApiProperty({ type: String, isArray: true, default: [] }) equipmentIds?: string[];
}

export class UpdateProtocolDto extends PartialType(CreateProtocolDto) {
  @ApiProperty({ required: false }) active?: boolean;
}

export class ProtocolResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() professionalId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ nullable: true }) appointmentId!: string | null;
  @ApiProperty() totalSessions!: number;
  @ApiProperty() sessionsPerWeek!: number;
  @ApiProperty() diagnosis!: string;
  @ApiProperty({ nullable: true }) observations!: string | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, isArray: true }) equipmentIds!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
