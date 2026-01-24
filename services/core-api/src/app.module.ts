import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Domain modules
import { InventoryModule } from './modules/inventory/inventory.module';
import { ImportsModule } from './modules/imports/imports.module';

// ✅ New modules
import { JobsModule } from './modules/jobs/jobs.module';
import { ExportsModule } from './modules/exports/exports.module';

// ✅ Sales (추가)
import { SalesModule } from './modules/sales/sales.module';

// ✅ CJ API (추가)
import { CjApiModule } from './modules/cj-api/cj-api.module';

// ✅ Stores (매장 관리)
import { StoresModule } from './modules/stores/stores.module';

// ✅ Locations (창고/로케이션 관리)
import { LocationsModule } from './modules/locations/locations.module';

// ✅ Auth (Firebase 인증 + Employee 관리)
import { AuthModule } from './modules/auth/auth.module';

// ✅ Departments (본사 부서 관리)
import { DepartmentsModule } from './modules/departments/departments.module';

// ✅ Events (달력 이벤트)
import { EventsModule } from './modules/events/events.module';

// ✅ BoardPosts (게시판)
import { BoardPostsModule } from './modules/board-posts/board-posts.module';

// ✅ Messages (공지 메시지)
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    InventoryModule,
    ImportsModule,

    JobsModule,
    ExportsModule,

    // ✅ 매출 업로드/조회
    SalesModule,

    // ✅ CJ 대한통운 택배 API
    CjApiModule,

    // ✅ 매장 관리
    StoresModule,

    // ✅ 창고/로케이션 관리
    LocationsModule,

    // ✅ Firebase 인증 + Employee 관리
    AuthModule,

    // ✅ 본사 부서 관리
    DepartmentsModule,

    // ✅ 달력 이벤트
    EventsModule,

    // ✅ 게시판
    BoardPostsModule,

    // ✅ 공지 메시지
    MessagesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
