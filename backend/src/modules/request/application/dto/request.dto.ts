import {
  IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateRequestTypeDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @IsNotEmpty() key!: string;
  @IsString() @IsNotEmpty() nameTh!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() category?: string;
}

export class UpdateRequestTypeDto {
  @IsOptional() @IsString() nameTh?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() visibleToRolesJson?: unknown;
  @IsOptional() visibleToCompaniesJson?: unknown;
  @IsOptional() visibleToDepartmentsJson?: unknown;
  @IsOptional() @IsBoolean() requiresAttachment?: boolean;
  @IsOptional() @IsBoolean() allowCancelByRequester?: boolean;
  @IsOptional() @IsBoolean() cancelBeforeApprovalOnly?: boolean;
  @IsOptional() @IsInt() slaHours?: number;
  @IsOptional() @IsBoolean() notifyRequesterOnStepChange?: boolean;
  @IsOptional() @IsBoolean() notifyLeadersOnSubmit?: boolean;
  @IsOptional() @IsInt() telegramMenuOrder?: number;
  @IsOptional() @IsString() telegramMenuIcon?: string;
}

export class CreateFormFieldDto {
  @IsString() @IsNotEmpty() key!: string;
  @IsString() @IsNotEmpty() labelTh!: string;
  @IsOptional() @IsString() labelEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @IsNotEmpty() fieldType!: string;
  @IsOptional() @IsString() placeholder?: string;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() defaultValueJson?: unknown;
  @IsOptional() optionsJson?: unknown;
  @IsOptional() validationJson?: unknown;
  @IsOptional() visibilityConditionJson?: unknown;
  @IsOptional() formulaJson?: unknown;
  @IsOptional() sourceJson?: unknown;
}

export class UpdateFormFieldDto extends CreateFormFieldDto {}

export class ReorderFieldsDto {
  @IsArray() @IsUUID(undefined, { each: true }) fieldIds!: string[];
}

export class CreateApprovalFlowDto {
  @IsString() @IsNotEmpty() name!: string;
}

export class CreateApprovalStepDto {
  @IsInt() @Min(1) stepOrder!: number;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() approverType!: string;
  @IsOptional() @IsString() approverRole?: string;
  @IsOptional() @IsUUID() approverEmployeeId?: string;
  @IsOptional() @IsString() approverFieldKey?: string;
  @IsOptional() @IsString() requiredDecision?: string;
  @IsOptional() @IsBoolean() canReject?: boolean;
  @IsOptional() conditionJson?: unknown;
  @IsOptional() @IsBoolean() notifyTelegram?: boolean;
}

export class UpdateApprovalStepDto extends CreateApprovalStepDto {}

export class ReorderStepsDto {
  @IsArray() @IsUUID(undefined, { each: true }) stepIds!: string[];
}

export class PatchRequestValuesDto {
  values!: Record<string, unknown>;
}

export class SubmitRequestDto {
  @IsOptional() @IsString() note?: string;
}

export class CancelRequestDto {
  @IsOptional() @IsString() reason?: string;
}

export class ApproveRequestDto {
  @IsOptional() @IsString() note?: string;
}

export class RejectRequestDto {
  @IsString() @IsNotEmpty() note!: string;
}

export class AddCommentDto {
  @IsString() @IsNotEmpty() comment!: string;
  @IsOptional() @IsString() visibility?: 'internal' | 'requester_visible';
}

export class ListRequestsQuery {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() requestTypeId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() requesterEmployeeId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsUUID() approverEmployeeId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() requestTypeKey?: string;
  @IsOptional() @IsString() category?: string;
}

export class ListApprovalHistoryQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() requestTypeKey?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}

export class CreateEmployeeReferralDto {
  @IsUUID() companyId!: string;
  @IsString() @IsNotEmpty() candidateName!: string;
  @IsString() @IsNotEmpty() candidatePhone!: string;
  @IsOptional() @IsString() candidateLineId?: string;
  @IsOptional() @IsString() candidateEmail?: string;
  @IsOptional() @IsString() targetPosition?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateEmployeeReferralDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() rejectedReason?: string;
  @IsOptional() @IsString() note?: string;
}

export class LinkEmployeeReferralDto {
  @IsUUID() referredEmployeeId!: string;
}

export class CreateReferralProgramDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNotEmpty() bonusAmount!: number;
  @IsOptional() @IsString() currency?: string;
}

export class UpdateReferralProgramDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() bonusAmount?: number;
  @IsOptional() @IsString() status?: string;
}
