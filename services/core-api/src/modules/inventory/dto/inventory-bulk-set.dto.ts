import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryBulkSetItemDto {
  @IsString()
  @IsNotEmpty()
  skuCode!: string;

  @IsString()
  @IsNotEmpty()
  locationCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;

  @IsOptional()
  @IsString()
  memo?: string;
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
