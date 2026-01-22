import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryResetRowDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;              // SKU 코드 (필수)

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;              // 수량 (필수)

  @IsOptional()
  @IsString()
  location?: string;         // Location 코드 (선택, 없으면 UNASSIGNED)

  @IsOptional()
  @IsString()
  makerCode?: string;        // 바코드/메이커코드 (선택)

  @IsOptional()
  @IsString()
  name?: string;             // 상품명 (선택)

  @IsOptional()
  @IsString()
  productType?: string;      // 상품구분 (선택)
}

export class InventoryResetDto {
  @IsString()
  @IsNotEmpty()
  storeCode!: string;        // 매장코드 (필수)

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryResetRowDto)
  rows!: InventoryResetRowDto[];
}
