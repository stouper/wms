import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ScanDto {
  @IsString()
  value!: string; // makerCode 또는 skuCode 입력값

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsString()
  locationCode?: string; // 있으면 그 위치 우선, 없으면 자동

  @IsOptional()
  @IsBoolean()
  force?: boolean; // 409 이후 승인범위 내 재시도용

  // ✅ 작업자 ID (MVP: 필수 아님, 프론트에서 보내면 저장)
  @IsOptional()
  @IsString()
  operatorId?: string;
}
