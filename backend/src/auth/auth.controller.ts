import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { Db } from '../db';
import { input } from '../common/input';
import { Actor, Principal, Public } from './access';
const credentials = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(10).max(128),
});
@Controller('auth')
export class AuthController {
  constructor(
    private db: Db,
    private jwt: JwtService,
  ) {}
  private async session(user: Principal, res: Response) {
    res.cookie('session', await this.jwt.signAsync({ sub: user.id }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return user;
  }
  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = input(credentials.extend({ name: z.string().trim().min(2).max(80) }), body);
    if (await this.db.user.findUnique({ where: { email: data.email } }))
      throw new ConflictException('This email is already registered');
    const user = await this.db.user.create({
      data: { name: data.name, email: data.email, passwordHash: await hash(data.password, 12) },
      select: { id: true, email: true, name: true, role: true },
    });
    return this.session(user, res);
  }
  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = input(credentials, body);
    const user = await this.db.user.findUnique({ where: { email: data.email } });
    if (!user || !(await compare(data.password, user.passwordHash)))
      throw new UnauthorizedException('Email or password is incorrect');
    return this.session({ id: user.id, email: user.email, name: user.name, role: user.role }, res);
  }
  @Post('logout') logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('session', { path: '/' });
    return { ok: true };
  }
  @Get('me') me(@Actor() user: Principal) {
    return user;
  }
}
