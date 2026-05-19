import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateMedicalRecordDto {
  @ApiProperty() patientId!: string;
  @ApiProperty({ required: false }) appointmentId?: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, isArray: true, default: [] }) attachmentUrls?: string[];
}

export class UpdateMedicalRecordDto extends PartialType(CreateMedicalRecordDto) {}

export class MedicalRecordResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() professionalId!: string;
  @ApiProperty({ nullable: true }) appointmentId!: string | null;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, isArray: true }) attachmentUrls!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
