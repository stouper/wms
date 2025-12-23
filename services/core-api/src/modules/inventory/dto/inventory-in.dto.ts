import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryInDto {
  // ✅ 둘 중 하나면 됨: skuCode(단품코드) 또는 makerCode(바코드)
  @IsOptional()
  @IsString()
  skuCode?: string;

  @IsOptional()
  @IsString()
  makerCode?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  // ✅ 입고는 로케이션 필수 (RET-01 등)
  @IsString()
  @IsNotEmpty()
  locationCode!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
