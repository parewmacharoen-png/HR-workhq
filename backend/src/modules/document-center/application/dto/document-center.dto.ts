import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @IsUUID()
  employeeId!: string;

  @IsEnum(DocumentType)
  docType!: DocumentType;

  @IsString()
  fileKey!: string;

  @IsString()
  fileName!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ListEmployeeDocumentsQuery {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
