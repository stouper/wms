import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JobType } from '@prisma/client';

export class CreateJobDto {
  @IsString()
  storeCode!: string; // 4000/4100/2400/5000...

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  // ✅ 작업자 ID (MVP: 필수 아님, 프론트에서 보내면 저장)
  @IsOptional()
  @IsString()
  operatorId?: string;
}
