import { IsInt, Min } from 'class-validator';

export class UpdateScoreDto {
  @IsInt()
  @Min(0)
  home_score: number;

  @IsInt()
  @Min(0)
  away_score: number;
}
