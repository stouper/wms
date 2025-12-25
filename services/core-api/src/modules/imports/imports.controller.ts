import { Controller, Post, UploadedFile, UseInterceptors, Body, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { Request } from 'express';

@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post('hq-inventory')
  @UseInterceptors(FileInterceptor('file'))
  uploadHq(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return this.svc.processHqInventory(req, file, body);
  }
}
