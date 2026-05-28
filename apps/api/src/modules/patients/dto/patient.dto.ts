import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: '111.444.777-35' }) cpf!: string;
  @ApiProperty({ type: String, format: 'date' }) birthDate!: string;
  @ApiProperty({ example: '+55 31 99999-0000' }) phone!: string;
  @ApiProperty({ required: false, format: 'email' }) email?: string;
  @ApiProperty({ required: false }) emergencyContact?: string;
  @ApiProperty({ required: false }) notes?: string;
  @ApiProperty({ required: false, description: 'Apelido/referência interna — só ADMIN.' })
  adminReference?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class PatientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() unitId!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() fullName!: string;
  @ApiProperty() cpf!: string;
  @ApiProperty({ type: String, format: 'date-time' }) birthDate!: Date;
  @ApiProperty() phone!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) emergencyContact!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ nullable: true, description: 'Apelido/referência interna — null p/ não-ADMIN.' })
  adminReference!: string | null;
  @ApiProperty() hasIdfaceEnrolled!: boolean;
  @ApiProperty() hasUserAccount!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class InviteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty({ description: 'Token plain — entregue uma única vez na criação' })
  token!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty() redeemPath!: string;
}

export class InviteLookupResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      fullName: { type: 'string' },
      email: { type: 'string', nullable: true },
      cpf: { type: 'string' },
    },
  })
  patient!: { fullName: string; email: string | null; cpf: string };
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

export class RedeemInviteDto {
  @ApiProperty({ minLength: 8 }) password!: string;
}
