import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryBulkSetItemDto {
  @IsString()
  @IsNotEmpty()
  storeCode!: string;      // 매장코드 (필수)

  @IsString()
  @IsNotEmpty()
  skuCode!: string;        // 단품코드 (필수)

  @IsString()
  @IsNotEmpty()
  locationCode!: string;   // Location 코드 (필수)

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;            // 수량 (필수)

  @IsOptional()
  @IsString()
  memo?: string;           // 메모 (선택)
}

export class InventoryBulkSetDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryBulkSetItemDto)
  items!: InventoryBulkSetItemDto[];

  @IsOptional()
  @IsString()
  sourceKey?: string;
}
