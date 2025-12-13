import { Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('imports') // 최종 경로: /imports/...
export class ImportsController {
  @Get('ping')
  ping() {
    return { ok: true, where: '/imports/ping' };
  }

  @Post('orders')
  @UseInterceptors(FileInterceptor('file')) // ★ FormData 필드명 'file'과 반드시 일치
  uploadOrders(@UploadedFile() file: Express.Multer.File, @Query('type') type?: string) {
    console.log('[IMPORTS] type=', type, 'file?', !!file, file?.originalname, file?.size);
    if (!file) return { ok: false, reason: 'no file' };
    return { ok: true, filename: file.originalname, size: file.size, type: type ?? null };
  }
}
