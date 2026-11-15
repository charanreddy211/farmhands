import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { static as serveStatic } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use('/uploads', serveStatic(join(__dirname, '..', 'uploads')));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
