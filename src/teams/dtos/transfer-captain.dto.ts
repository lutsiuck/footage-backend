import { IsUUID } from 'class-validator';

export class TransferCaptainDto {
  @IsUUID()
  new_captain_id: string;
}
