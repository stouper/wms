import { Module } from '@nestjs/common';
import { CarriersController } from './carriers.controller.js';
import { CarriersService } from './carriers.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Module({
  controllers: [CarriersController],
  providers: [PrismaService, CarriersService], // ← PrismaService 제공 확인
})
export class CarriersModule {}
