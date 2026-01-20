import { Module } from '@nestjs/common';
import { CjApiService } from './cj-api.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CjApiService],
  exports: [CjApiService],
})
export class CjApiModule {}
