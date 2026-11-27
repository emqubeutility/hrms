import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** POST /auth/dev-login (development only). */
export class DevLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;
}
