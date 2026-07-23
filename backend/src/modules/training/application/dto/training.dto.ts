import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength,
} from 'class-validator';
import { TrainingLessonContentType } from '@prisma/client';

export class CreateTrainingCourseDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() lessons?: Array<{
    title: string;
    contentType: TrainingLessonContentType;
    contentJson: Record<string, unknown>;
    sortOrder?: number;
  }>;
}

export class UpdateTrainingCourseDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
}

export class AssignTrainingDto {
  @IsUUID() courseId!: string;
  @IsUUID() companyId!: string;
  @IsArray() @IsUUID(undefined, { each: true }) employeeIds!: string[];
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CompleteLessonDto {
  @IsUUID() lessonId!: string;
  @IsOptional() @IsBoolean() markCourseComplete?: boolean;
}

export class SubmitQuizDto {
  answers!: Record<string, string>;
}
