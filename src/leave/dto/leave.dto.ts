import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What carry forward means for one employee category. */
export class CarryRuleDto {
  @IsString() @MaxLength(100) category: string;
  @IsIn(['KEEP', 'UNPAID_LEAVE', 'LEAVE_SALARY', 'LAPSE']) action: string;
  @IsOptional() @Type(() => Number) @IsInt() targetLeaveTypeId?: number | null;
}

export class LeaveTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(10) @Matches(/^[A-Za-z0-9_-]+$/) code: string;
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsBoolean() isPaid: boolean;
  @IsBoolean() balanceTracking: boolean;
  @IsIn(['NONE', 'ANNUAL', 'MONTHLY']) accrual: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(366) annualDays: number;
  @IsBoolean() allowHalfDay: boolean;
  @IsBoolean() allowNegative: boolean;
  @IsBoolean() requiresDocument: boolean;
  @Type(() => Number) @IsInt() @Min(0) documentAfterDays: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxDaysPerRequest?: number | null;
  @IsBoolean() isSandwichEligible: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsBoolean() isEncashable?: boolean;
  @IsOptional() @IsBoolean() excludeWeeklyOffs?: boolean;
  @IsOptional() @IsBoolean() excludeHolidays?: boolean;
  @IsOptional() @IsBoolean() resetBalance?: boolean;
  @IsOptional() @IsIn(['NONE', 'CARRY_FORWARD']) carryForwardType?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CarryRuleDto) carryForwardRules?: CarryRuleDto[];
  @IsOptional() @IsString() @MaxLength(30) genderRestriction?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxTimesInService?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) eventWindowMonths?: number | null;
  @IsOptional() @IsString() @MaxLength(60) eventLabel?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) payPercent?: number;
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true }) unlockAfterTypeIds?: number[];
  /** Month (1-12) this type's calendar starts in; empty = the company leave year. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) calendarStartMonth?: number | null;
  @IsBoolean() isCompOff: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Country.isoCode values this type applies to (checked against the Countries list). Empty/omitted = every country. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) countryCodes?: string[];
}

export class LeaveSettingsDto {
  @IsBoolean() sandwichEnabled: boolean;
  @IsBoolean() sandwichWeeklyOffs: boolean;
  @IsBoolean() sandwichHolidays: boolean;
  @IsBoolean() sandwichRequireBothSides: boolean;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) leaveYearStartMonth: number;
  @IsBoolean() compOffEnabled: boolean;
  @Type(() => Number) @IsNumber() @Min(0.25) @Max(5) compOffCreditDays: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) compOffExpiryDays?: number | null;
  @Type(() => Number) @IsInt() @Min(0) compOffMinWorkedMinutes: number;
}

export class LeaveRequestDto {
  @Type(() => Number) @IsInt() leaveTypeId: number;
  @IsString() @Matches(DATE) fromDate: string;
  @IsString() @Matches(DATE) toDate: string;
  @IsOptional() @IsIn(['FIRST', 'SECOND']) halfDayPart?: string;
  @IsOptional() @IsString() @Matches(DATE) eventDate?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class LeaveDecisionDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class AccrualDto {
  /** Any date inside the period to credit; defaults to today. */
  @IsOptional() @IsString() @Matches(DATE) asOf?: string;
}

export class AdjustBalanceDto {
  @Type(() => Number) @IsInt() employeeId: number;
  @Type(() => Number) @IsInt() leaveTypeId: number;
  /** Positive adds days, negative takes days away. */
  @Type(() => Number) @IsNumber() days: number;
  @IsString() @IsNotEmpty() @MaxLength(200) note: string;
  @IsOptional() @IsString() @Matches(DATE) expiresOn?: string;
}

/** The same days for everyone in a branch, a country or the whole company. */
export class AdjustGroupDto {
  @IsIn(['BRANCH', 'COUNTRY', 'COMPANY', 'SITE']) scope: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() siteId?: number;
  @IsOptional() @IsString() @MaxLength(10) countryCode?: string;
  @Type(() => Number) @IsInt() leaveTypeId: number;
  /** Positive adds days, negative takes days away. */
  @Type(() => Number) @IsNumber() days: number;
  @IsString() @IsNotEmpty() @MaxLength(200) note: string;
  @IsOptional() @IsString() @Matches(DATE) expiresOn?: string;
}
