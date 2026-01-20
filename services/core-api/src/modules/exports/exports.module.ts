import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { CjApiModule } from '../cj-api/cj-api.module';

@Module({
  imports: [CjApiModule],
  controllers: [ExportsController],
  providers: [ExportsService, PrismaService],
})
export class ExportsModule {}
