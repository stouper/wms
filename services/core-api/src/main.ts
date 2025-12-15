import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS: 로컬/관리도구/차후 프론트 연동 대비
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 업로드·엑셀 파싱 시 본문 용량 여유
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // DTO 검증 기본값 (필드 화이트리스트 + 변환)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: false,
    }),
  );

  // 필요하면 prefix 사용 (현재는 API 루트 그대로 사용)
  // app.setGlobalPrefix('api');

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  // console.log(`🚀 core-api on http://localhost:${port}`);
}

bootstrap();
