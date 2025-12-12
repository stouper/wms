import { Express } from 'express';
import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';

type ImportType = 'STORE' | 'PARCEL';

@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post('orders')
  @UseInterceptors(FileInterceptor('file'))
  async importOrders(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: ImportType,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('CSV 파일이 필요합니다 (form field: file)');
    }
    if (type !== 'STORE' && type !== 'PARCEL') {
      throw new BadRequestException('type=STORE 또는 type=PARCEL 이어야 합니다');
    }
    return this.svc.importOrdersCsv(file.buffer, type);
  }
}
