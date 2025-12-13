import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ImportsController } from './imports.controller';

@Module({
  imports: [MulterModule.register({})], // 파일 업로드용
  controllers: [ImportsController],
})
export class ImportsModule {}
