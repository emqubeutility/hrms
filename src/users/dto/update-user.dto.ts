import { IsInt, IsOptional, IsBoolean, IsArray, ArrayUnique, IsEmail, MaxLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  userTypeId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Development only: show this user on the login page for passwordless sign-in (ignored in production). */
  @IsOptional()
  @IsBoolean()
  devQuickLogin?: boolean;

  /** Email on the account's profile, used for password reset emails. An empty text clears it. */
  @ValidateIf((o) => o.email !== undefined && o.email !== '')
  @IsEmail()
  @MaxLength(120)
  email?: string;

  /** true = every branch; false = only branchIds. System Admin only. */
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Type(() => Number)
  branchIds?: number[];
}
