import { IsOptional, IsString } from 'class-validator';

export class UpsertParcelDto {
  @IsOptional()
  @IsString()
  orderNo?: string;

  @IsString()
  recipientName!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsString()
  addr1!: string;

  @IsOptional()
  @IsString()
  addr2?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  carrierCode?: string;
}
