import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class JobItemInput {
  @IsOptional()
  @IsString()
  skuCode?: string;

  @IsOptional()
  @IsString()
  makerCode?: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class AddItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobItemInput)
  items!: JobItemInput[];
}
