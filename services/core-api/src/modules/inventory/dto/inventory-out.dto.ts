import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
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
}
