import { IsDateString, IsUUID } from 'class-validator';

export class CreateMatchDto {
  @IsUUID()
  tournament_id: string;

  @IsUUID()
  home_team_id: string;

  @IsUUID()
  away_team_id: string;

  @IsDateString()
  match_date: string;
}
