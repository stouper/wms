import { Module } from '@nestjs/common';
import { BoardPostsController } from './board-posts.controller';
import { BoardPostsService } from './board-posts.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BoardPostsController],
  providers: [BoardPostsService],
  exports: [BoardPostsService],
})
export class BoardPostsModule {}
