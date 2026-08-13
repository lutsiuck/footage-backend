import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt';

@Injectable()
export class JwtConfigService implements JwtOptionsFactory {
  constructor(private configService: ConfigService) {}

  createJwtOptions(): JwtModuleOptions {
    return {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      signOptions: {
        algorithm: 'HS256',
      },
      verifyOptions: {
        algorithms: ['HS256'],
        ignoreExpiration: false,
      },
    };
  }
}
