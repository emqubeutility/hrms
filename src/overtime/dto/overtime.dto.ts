import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { OVERTIME_TYPES } from '../overtime-rules';

/** POST /overtime-configurations */
export class CreateOvertimeConfigurationDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsIn(OVERTIME_TYPES as unknown as string[])
  type!: string;

  /** Fixed types only: amount per weekend/holiday day (FIXED_PER_DAY) or per month (FIXED_MONTHLY). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  fixedAmount?: number | null;

  /** Hourly only: multiplier on the hourly rate for weekday OT hours, e.g. 1.25. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  weekdayMultiplier?: number | null;

  /** Hourly only: multiplier for weekend and holiday OT hours, e.g. 1.5. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  weekendMultiplier?: number | null;
}

/** PATCH /overtime-configurations/:id — send only what changes. */
export class UpdateOvertimeConfigurationDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsIn(OVERTIME_TYPES as unknown as string[])
  type?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  fixedAmount?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  weekdayMultiplier?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(10)
  weekendMultiplier?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
