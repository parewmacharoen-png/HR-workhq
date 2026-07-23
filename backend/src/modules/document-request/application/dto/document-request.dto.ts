import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDocumentRequestDto {
  @IsUUID() companyId!: string;
  @IsString() typeKey!: string;
  @IsOptional() @IsObject() formData?: Record<string, unknown>;
}

export interface DocumentRequestResponse {
  id: string;
  employeeId: string;
  companyId: string;
  typeKey: string;
  typeName: string;
  status: string;
  workflowInstanceId: string | null;
  employeeDocumentId: string | null;
  rejectionReason: string | null;
  createdAt: string;
}
