import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ApprovalHubPendingQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class ApprovalHubSummaryQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
}
