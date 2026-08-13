import { IsUUID } from 'class-validator';

export class InvitePlayerDto {
  @IsUUID()
  user_id: string;
}
