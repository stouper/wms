import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class InventoryOutDto {
  @IsOptional()
  @IsString()
  skuCode?: string; // 사람이 치는 코드

  @IsOptional()
  @IsString()
  makerCode?: string; // 스캐너 바코드

  @IsOptional()
  @IsString()
  locationCode?: string; // 있으면 그 위치 우선, 부족하면 자동 폴백

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}
