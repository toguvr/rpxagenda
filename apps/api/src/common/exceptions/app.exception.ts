import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exceção de domínio com código estável (para clientes mobile/admin tratarem casos específicos).
 * Subclasses devem definir um `code` curto em SCREAMING_SNAKE_CASE.
 */
export abstract class AppException extends HttpException {
  abstract readonly code: string;

  constructor(
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
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

export class ResourceNotFoundException extends AppException {
  readonly code = 'RESOURCE_NOT_FOUND';
  constructor(resource: string) {
    super(`${resource} não encontrado(a)`, HttpStatus.NOT_FOUND);
  }
}

export class ResourceConflictException extends AppException {
  readonly code = 'RESOURCE_CONFLICT';
  constructor(message: string, details?: unknown) {
    super(message, HttpStatus.CONFLICT, details);
  }
}

export class InviteInvalidException extends AppException {
  readonly code = 'INVITE_INVALID';
  constructor(message = 'Convite inválido, expirado ou já utilizado') {
    super(message, HttpStatus.GONE);
  }
}

/**
 * Falhas das regras de capacidade (§4.3 do CLAUDE.md). O code expõe qual check
 * falhou para o cliente tratar com mensagem específica.
 */
export class AppointmentValidationException extends AppException {
  readonly code: string;
  constructor(code: string, message: string, details?: unknown) {
    super(message, HttpStatus.CONFLICT, details);
    this.code = code;
  }
}
