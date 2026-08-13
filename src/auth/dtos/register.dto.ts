import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  @MaxLength(50, { message: 'Name must be less than 50 characters' })
  @MinLength(3, { message: 'Name must be at least 3 characters' })
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be valid' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128, { message: 'Password must be less than 128 characters' })
  password: string;

  @IsOptional()
  avatar_url: string;

  @IsOptional()
  city: string;

  @IsOptional()
  @IsBoolean()
  is_organizer: boolean;
}
