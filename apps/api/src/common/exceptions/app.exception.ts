import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exceção de domínio com código estável (para clientes mobile/admin tratarem casos específicos).
 * Subclasses devem definir um `code` curto em SCREAMING_SNAKE_CASE.
 */
export abstract class AppException extends HttpException {
  abstract readonly code: string;

  constructor(message: string, status: HttpStatus, public readonly details?: unknown) {
    super(message, status);
  }
}

export class InvalidCredentialsException extends AppException {
  readonly code = 'INVALID_CREDENTIALS';
  constructor() {
    super('Credenciais inválidas', HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshTokenInvalidException extends AppException {
  readonly code = 'REFRESH_TOKEN_INVALID';
  constructor(message = 'Refresh token inválido ou expirado') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}
