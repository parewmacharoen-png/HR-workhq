// ============================================================================
// auth/auth.controller.ts
// ============================================================================

import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { SkipPasswordChange } from './decorators/skip-password-change.decorator';
import { AuthenticatedUser } from './jwt.types';

class LoginDto {
  @IsString() @MinLength(1) username!: string;
  @IsString() @MinLength(1) password!: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @SkipPasswordChange()
  @Get('me')
  me(@Req() req: { user: AuthenticatedUser }) {
    return this.auth.getMe(req.user.id, req.user.companyId);
  }

  @SkipPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  changePassword(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
