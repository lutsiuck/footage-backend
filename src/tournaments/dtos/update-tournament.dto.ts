import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTournamentDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
