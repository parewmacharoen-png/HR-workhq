// ============================================================================
// modules/recruitment/application/dto/recruitment.dto.ts
// ============================================================================

import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, Length, Min, Max, IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Candidate ────────────────────────────────────────────────────────────────
export class CreateCandidateDto {
  @IsUUID()        companyId!: string;
  @IsUUID()        recruiterEmployeeId!: string;
  @IsString() @Length(1, 160) fullName!: string;
  @IsOptional() @IsString() @Length(1, 32)  phone?: string;
  @IsOptional() @IsEmail()                   email?: string;
  @IsOptional() @IsString() @Length(1, 160) position?: string;
  @IsOptional() @IsString() @Length(1, 80)  source?: string;
  @IsOptional() @IsString()                  notes?: string;
}

export class UpdateCandidateDto {
  @IsOptional() @IsString() @Length(1, 160) fullName?: string;
  @IsOptional() @IsString() @Length(1, 32)  phone?: string;
  @IsOptional() @IsEmail()                   email?: string;
  @IsOptional() @IsString() @Length(1, 160) position?: string;
  @IsOptional() @IsString() @Length(1, 80)  source?: string;
  @IsOptional() @IsString()                  notes?: string;
}

export class MovePipelineDto {
  @IsEnum(['lead','screened','interview','offer','hired','started','passed_probation','rejected'] as const)
  stage!: string;
  @IsOptional() @IsString() notes?: string;
}

// ── Interview ────────────────────────────────────────────────────────────────
export class CreateInterviewDto {
  @IsUUID()       candidateId!: string;
  @IsUUID()       companyId!: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsNumber() @Min(1) round?: number;
  @IsOptional() @IsString() @Length(1, 200) location?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) interviewerIds?: string[];
}

export class ResolveInterviewDto {
  @IsEnum(['passed', 'failed', 'no_show'] as const) outcome!: 'passed' | 'failed' | 'no_show';
  @IsOptional() @IsNumber() @Min(0) @Max(10) score?: number;
  @IsOptional() @IsString() notes?: string;
}

// ── Offer ────────────────────────────────────────────────────────────────────
export class CreateOfferDto {
  @IsUUID()       candidateId!: string;
  @IsUUID()       companyId!: string;
  @IsString() @Length(1, 160) position!: string;
  @IsNumber() @Min(0.01)      baseSalary!: number;
  @IsDateString()              expiryDate!: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsString()     notes?: string;
}

export class OfferResponseDto {
  @IsEnum(['accept', 'decline', 'withdraw'] as const) action!: 'accept' | 'decline' | 'withdraw';
  @IsOptional() @IsString() notes?: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export class AnalyticsQuery {
  @IsUUID()         companyId!: string;
  @IsDateString()   from!: string;
  @IsDateString()   to!: string;
}

// ── Responses ────────────────────────────────────────────────────────────────
export interface CandidateResponse {
  id: string; companyId: string; recruiterEmployeeId: string;
  fullName: string; phone: string | null; email: string | null;
  position: string | null; source: string | null; stage: string;
  isUniqueCounted: boolean; hiredAt: string | null;
}
export interface InterviewResponse {
  id: string; candidateId: string; round: number;
  scheduledAt: string; outcome: string; score: number | null;
}
export interface OfferResponse {
  id: string; candidateId: string; position: string;
  baseSalary: number; status: string; expiryDate: string;
}
export interface PipelineEventResponse {
  fromStage: string | null; toStage: string; changedAt: string;
}
