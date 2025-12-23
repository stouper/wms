import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryOutDto {
  @IsString()
  @IsNotEmpty()
  skuCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsString()
  @IsNotEmpty()
  locationCode!: string;

  // ✅ 재고 부족 시 강제 출고(전산 재고 0 유지 + 로그만 남김)
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force?: boolean;

  // ✅ 강제 출고 사유(선택)
  @IsOptional()
  @IsString()
  forceReason?: string;
}
