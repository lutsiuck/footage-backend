import { MatchEventType } from '@prisma/client';
import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateMatchEventDto {
  @IsUUID()
  player_id: string;

  @IsEnum(MatchEventType)
  type: MatchEventType;

  @IsInt()
  @Min(0)
  @Max(200)
  minute: number;
}
