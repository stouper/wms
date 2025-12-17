import { IsOptional, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  storeCode!: string; // 4000/4100/2400/5000...

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}
