// prisma.config.ts (Prisma 7 방식)
import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  // 스키마 위치
  schema: 'prisma/schema.prisma',

  // ★ 접속 URL은 여기서!
  datasource: {
    url: env('DATABASE_URL'),
  },

  // (선택) 기본 명령 옵션들 필요시 여기에 추가 가능
});
