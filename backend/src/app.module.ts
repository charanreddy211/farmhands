import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { GroupsModule } from './groups/groups.module';
import { RequestsModule } from './requests/requests.module';
import { RequestEntity } from './requests/request.entity';
import { User } from './users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'farmhands',
      password: process.env.DB_PASSWORD ?? 'farmhands',
      database: process.env.DB_DATABASE ?? 'farmhands',
      entities: [User, RequestEntity],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    GroupsModule,
    RequestsModule,
  ],
})
export class AppModule {}
