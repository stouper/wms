import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, PrismaService],
})
export class ImportsModule {}
