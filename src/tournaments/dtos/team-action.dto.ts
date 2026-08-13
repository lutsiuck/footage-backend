import { IsUUID } from 'class-validator';

export class TeamActionDto {
  @IsUUID()
  team_id: string;
}
