import { Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PushService } from './push.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [FirebaseService, AuthService, PushService],
  exports: [FirebaseService, AuthService, PushService],
})
export class AuthModule {}
