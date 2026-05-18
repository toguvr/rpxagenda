import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@rpxexpert.local', format: 'email' })
  email!: string;

  @ApiProperty({ example: 'RpxAdmin@2026', minLength: 8 })
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token recebido no login.' })
  refreshToken!: string;
}

export class AuthenticatedUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: ['ADMIN', 'PROFESSIONAL', 'PATIENT'] }) role!: string;
  @ApiProperty() unitId!: string;
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ type: AuthenticatedUserDto }) user!: AuthenticatedUserDto;
}
