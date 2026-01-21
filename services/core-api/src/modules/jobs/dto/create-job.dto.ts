import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { JobType } from '@prisma/client';

export class CreateJobDto {
  @IsString()
  storeId!: string; // Store FK (매장 ID)

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

  // ✅ 의뢰요청일
  @IsOptional()
  @IsString()
  requestDate?: string;

  // ✅ 배치(묶음) Job용 필드
  @IsOptional()
  @IsString()
  parentId?: string; // 부모 Job ID (배치 Job의 하위로 생성 시)

  @IsOptional()
  @IsString()
  packType?: string; // "single" | "multi" (단포/합포)

  @IsOptional()
  @IsInt()
  sortOrder?: number; // 스캔 우선순위 (단포=1, 합포=2)
}
