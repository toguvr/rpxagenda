import { ApiProperty } from '@nestjs/swagger';

export class CreateProfessionalDto {
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: 'CREFITO 12345-F' }) registry!: string;
  @ApiProperty({ type: String, isArray: true, default: [] }) serviceIds?: string[];
  @ApiProperty({
    type: String,
    isArray: true,
    default: [],
    description: 'Telas do admin que o profissional pode acessar (keys de SCREENS).',
  })
  allowedScreens?: string[];
  @ApiProperty({ default: true }) active?: boolean;
}

export class UpdateProfessionalDto {
  @ApiProperty({ required: false }) fullName?: string;
  @ApiProperty({ required: false }) registry?: string;
  @ApiProperty({ required: false }) active?: boolean;
  @ApiProperty({ type: String, isArray: true, required: false }) serviceIds?: string[];
  @ApiProperty({ type: String, isArray: true, required: false }) allowedScreens?: string[];
}

export class ProfessionalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() registry!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: String, isArray: true }) serviceIds!: string[];
  @ApiProperty({ type: String, isArray: true }) allowedScreens!: string[];
  @ApiProperty() hasAccess!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class ProfessionalInviteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() professionalId!: string;
  @ApiProperty() token!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty() redeemPath!: string;
}

class ProfessionalInviteLookupProfessionalDto {
  @ApiProperty() fullName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() registry!: string;
}

export class ProfessionalInviteLookupResponseDto {
  @ApiProperty({ type: ProfessionalInviteLookupProfessionalDto })
  professional!: ProfessionalInviteLookupProfessionalDto;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

export class RedeemProfessionalInviteDto {
  @ApiProperty({ minLength: 8 }) password!: string;
}
