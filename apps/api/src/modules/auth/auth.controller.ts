import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  resetPasswordRequestSchema,
  type ForgotPasswordRequest,
  type LoginResponse,
  type ResetPasswordRequest,
} from '@rpx/shared';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';
import {
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  RefreshDto,
  ResetPasswordDto,
} from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica um usuário com email e senha' })
  @ApiOkResponse({ type: LoginResponseDto })
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotaciona o par access/refresh token' })
  @ApiOkResponse({ type: LoginResponseDto })
  @UsePipes(new ZodValidationPipe(refreshRequestSchema))
  refresh(@Body() body: RefreshDto): Promise<LoginResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoga o refresh token informado' })
  @UsePipes(new ZodValidationPipe(refreshRequestSchema))
  async logout(@Body() body: RefreshDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Solicita redefinição de senha. Envia link por e-mail se o usuário existir.',
  })
  @ApiNoContentResponse()
  @UsePipes(new ZodValidationPipe(forgotPasswordRequestSchema))
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.auth.requestPasswordReset((body as ForgotPasswordRequest).email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefine a senha a partir do token recebido por e-mail.' })
  @ApiNoContentResponse()
  @UsePipes(new ZodValidationPipe(resetPasswordRequestSchema))
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    const { token, password } = body as ResetPasswordRequest;
    await this.auth.resetPassword(token, password);
  }
}
