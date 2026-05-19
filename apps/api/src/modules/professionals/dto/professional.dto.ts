import { ApiProperty } from '@nestjs/swagger';

export class CreateProfessionalDto {
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ minLength: 8 }) password!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: 'CREFITO 12345-F' }) registry!: string;
  @ApiProperty({ type: String, isArray: true, default: [] }) serviceIds?: string[];
  @ApiProperty({ default: true }) active?: boolean;
}

export class UpdateProfessionalDto {
  @ApiProperty({ required: false }) fullName?: string;
  @ApiProperty({ required: false }) registry?: string;
  @ApiProperty({ required: false }) active?: boolean;
  @ApiProperty({ type: String, isArray: true, required: false }) serviceIds?: string[];
}

export class ProfessionalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() registry!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, isArray: true }) serviceIds!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
