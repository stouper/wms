import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post('orders')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_, file, cb) => {
        // 브라우저가 종종 application/octet-stream으로 보내니 csv/텍스트/옥텟 전부 허용
        const ok =
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' || // 일부 브라우저
          file.mimetype === 'application/octet-stream';
        if (!ok) return cb(new BadRequestException('CSV only'), false);
        cb(null, true);
      },
    }),
  )
  async importOrders(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: 'STORE' | 'ONLINE' = 'STORE',
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Empty file');
    }

    console.log('[ImportsController] /imports/orders hit', {
      type,
      hasFile: !!file,
      filename: file.originalname,
      bytes: file.buffer.length,
      mimetype: file.mimetype,
    });

    // CSV 파싱 → 레코드 배열
    const { rows, header, sample } = await this.svc.parseCsv(file.buffer);

    // (선택) 여기에서 서비스로 DB 업서트 위임 가능:
    // const result = await this.svc.upsertOrders(rows, { type });

    return {
      ok: true,
      type,
      filename: file.originalname,
      bytes: file.buffer.length,
      header,
      count: rows.length,
      sample, // 앞부분 3줄 미리보기
      // result, // 나중에 Prisma 반영 결과
    };
  }
}
