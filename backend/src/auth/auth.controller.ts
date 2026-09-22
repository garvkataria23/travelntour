import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.register({ ...dto, userAgent, ip });
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    return this.authService.login(dto, userAgent, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
  ) {
    return this.authService.refresh(dto.refreshToken, userAgent, ip);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }
}