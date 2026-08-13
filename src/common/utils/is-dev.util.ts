import { ConfigService } from '@nestjs/config';

export const isDev = (configService: ConfigService) => {
  return configService.getOrThrow<string>('NODE_ENV') === 'development';
};
