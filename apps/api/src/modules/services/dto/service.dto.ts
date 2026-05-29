import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty({ example: 'Fisioterapia' }) name!: string;
  @ApiProperty({ enum: ['FISIO', 'MUSCULACAO', 'RPG', 'PILATES', 'AVALIACAO'] }) type!: string;
  @ApiProperty({ example: 50 }) durationMinutes!: number;
  @ApiProperty({ example: 5, default: 1 }) slotCapacity?: number;
  @ApiProperty({ example: 240, default: 240 }) cancellationLeadMinutes?: number;
  @ApiProperty({ example: 60, default: 60 }) schedulingLeadMinutes?: number;
  @ApiProperty({ example: 30, default: 30 }) checkInWindowBeforeMin?: number;
  @ApiProperty({ example: 15, default: 15 }) checkInWindowAfterMin?: number;
  @ApiProperty({ enum: ['PACKAGE', 'SUBSCRIPTION'] }) acceptedPlanType!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 120000,
    description: 'preço sugerido em centavos',
  })
  suggestedPriceCents?: number | null;
  @ApiProperty({ default: true }) active?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class ServiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['FISIO', 'MUSCULACAO', 'RPG', 'PILATES', 'AVALIACAO'] }) type!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() slotCapacity!: number;
  @ApiProperty() cancellationLeadMinutes!: number;
  @ApiProperty() schedulingLeadMinutes!: number;
  @ApiProperty() checkInWindowBeforeMin!: number;
  @ApiProperty() checkInWindowAfterMin!: number;
  @ApiProperty({ enum: ['PACKAGE', 'SUBSCRIPTION'] }) acceptedPlanType!: string;
  @ApiProperty({ nullable: true }) suggestedPriceCents!: number | null;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
