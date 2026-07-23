import {
  IsBoolean, IsDateString, IsEmail, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';

export class UpdateEmployeePersonalDto {
  @IsOptional() @IsString() @Length(1, 100) firstName?: string;
  @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @IsOptional() @IsString() @Length(0, 60) nickname?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @Length(0, 20) gender?: string;
  @IsOptional() @IsString() @Length(0, 80) nationality?: string;
  @IsOptional() @IsString() @Length(0, 80) religion?: string;
  @IsOptional() @IsString() @Length(0, 40) maritalStatus?: string;
  @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() @Length(0, 64) nationalId?: string;
  @IsOptional() @IsString() @Length(0, 64) socialSecurityNumber?: string;
  @IsOptional() @IsString() @Length(0, 64) passportNumber?: string;
  @IsOptional() @IsString() @Length(0, 160) emergencyContactName?: string;
  @IsOptional() @IsString() @Length(0, 80) emergencyContactRelationship?: string;
  @IsOptional() @IsString() @Length(0, 32) emergencyContactPhone?: string;
  @IsOptional() @IsString() reason?: string;
}

export class CreateEmployeeEducationDto {
  @IsString() @Length(1, 200) institution!: string;
  @IsOptional() @IsString() @Length(0, 120) degree?: string;
  @IsOptional() @IsString() @Length(0, 120) fieldOfStudy?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() description?: string;
}

export class UpdateEmployeeEducationDto {
  @IsOptional() @IsString() @Length(1, 200) institution?: string;
  @IsOptional() @IsString() @Length(0, 120) degree?: string;
  @IsOptional() @IsString() @Length(0, 120) fieldOfStudy?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() description?: string;
}

export class CreateEmployeeWorkExperienceDto {
  @IsString() @Length(1, 200) companyName!: string;
  @IsString() @Length(1, 120) jobTitle!: string;
  @IsOptional() @IsString() @Length(0, 120) location?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() description?: string;
}

export class UpdateEmployeeWorkExperienceDto {
  @IsOptional() @IsString() @Length(1, 200) companyName?: string;
  @IsOptional() @IsString() @Length(1, 120) jobTitle?: string;
  @IsOptional() @IsString() @Length(0, 120) location?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() description?: string;
}
