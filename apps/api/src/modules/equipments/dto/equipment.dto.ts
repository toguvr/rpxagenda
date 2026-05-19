import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateEquipmentDto {
  @ApiProperty({ example: 'Maca' }) name!: string;
  @ApiProperty({ example: 4, default: 1 }) totalQuantity?: number;
  @ApiProperty({ default: true }) active?: boolean;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}

export class EquipmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class SetServiceEquipmentsDto {
  @ApiProperty({ type: String, isArray: true, example: ['cuid_eq_1', 'cuid_eq_2'] })
  equipmentIds!: string[];
}
