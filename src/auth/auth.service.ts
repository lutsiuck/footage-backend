import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dtos/register.dto';
import { hash, verify } from 'argon2';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dtos/login.dto';
import { isDev } from 'src/common/utils/is-dev.util';
import { Request, Response } from 'express';

@Injectable()
export class AuthService {
  private readonly JWT_ACCESS_TOKEN_TTL: string;
  private readonly JWT_REFRESH_TOKEN_TTL: string;

  private readonly COOKIE_DOMAIN: string;

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {
    this.JWT_ACCESS_TOKEN_TTL = this.configService.getOrThrow<string>('JWT_ACCESS_TOKEN_TTL');
    this.JWT_REFRESH_TOKEN_TTL = this.configService.getOrThrow<string>('JWT_REFRESH_TOKEN_TTL');
    this.COOKIE_DOMAIN = this.configService.getOrThrow<string>('COOKIE_DOMAIN');
  }

  async register(response: Response, registerDto: RegisterDto) {
    const { email, password } = registerDto;

    const exisUser = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (exisUser) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.prismaService.user.create({
      data: {
        ...registerDto,
        password: await hash(password),
      },
    });

    return this.auth(response, user.id);
  }

  async login(response: Response, dto: LoginDto) {
    const { email, password } = dto;

    const user = await this.prismaService.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    const isPasswordValid = await verify(user.password, password);

    if (!isPasswordValid) {
      throw new NotFoundException('Invalid password');
    }

    return this.auth(response, user.id);
  }

  async refresh(req: Request, res: Response) {
    const refreshToken: string = req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new HttpException('Refresh token is missing', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const payload = await this.jwtService.verifyAsync(refreshToken);

    if (payload) {
      const user = await this.prismaService.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new HttpException('User with this refresh token does not exist', HttpStatus.UNPROCESSABLE_ENTITY);
      }

      return this.auth(res, user.id);
    }
  }

  async logout(res: Response) {
    this.setCookie(res, '', new Date(0));
  }

  async validateUser(id: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id,
      },
      omit: { password: true },
    });

    if (!user) {
      throw new HttpException('User with this id does not exist', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return user;
  }

  private auth(response: Response, id: string) {
    const { accessToken, refreshToken } = this.generateTokens(id);

    this.setCookie(response, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    return { accessToken };
  }

  private generateTokens(userId: string) {
    const payload = { userId };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.JWT_ACCESS_TOKEN_TTL as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.JWT_REFRESH_TOKEN_TTL as any,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      expires,
      domain: this.COOKIE_DOMAIN,
      secure: !isDev(this.configService),
      sameSite: 'lax',
    });
  }
}
