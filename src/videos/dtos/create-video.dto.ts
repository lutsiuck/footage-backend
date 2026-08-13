import { VideoType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVideoDto {
  @IsUUID()
  match_id: string;

  @IsString()
  @IsNotEmpty()
  video_url: string;

  @IsOptional()
  @IsString()
  thumbnail_url?: string;

  @IsOptional()
  @IsEnum(VideoType)
  type?: VideoType;
}
