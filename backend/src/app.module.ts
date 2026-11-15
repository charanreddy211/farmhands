import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { RequestsModule } from './requests/requests.module';
import { RequestEntity } from './requests/request.entity';
import { RequestRecipient } from './requests/request-recipient.entity';
import { Booking } from './requests/booking.entity';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { PlacesModule } from './places/places.module';
import { WorkersModule } from './workers/workers.module';
import { WorkerReview } from './workers/worker-review.entity';
import { WorkerSearchAlert } from './workers/worker-search-alert.entity';
import { SavedWorker } from './workers/saved-worker.entity';
import { LabourGroup } from './groups/labour-group.entity';
import { GroupsModule } from './groups/groups.module';

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

if (isProduction && !databaseUrl) {
  throw new Error('DATABASE_URL must be set in production.');
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(databaseUrl
        ? { url: databaseUrl }
        : {
            host: process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USERNAME ?? 'farmhands',
            password: process.env.DB_PASSWORD ?? 'farmhands',
            database: process.env.DB_DATABASE ?? 'farmhands',
          }),
      entities: [User, RequestEntity, RequestRecipient, Booking, WorkerReview, WorkerSearchAlert, SavedWorker, LabourGroup],
      migrations: [__dirname + '/**/migrations/*{.js,.ts}'],
      migrationsRun: isProduction,
      synchronize: !isProduction,
    }),
    AuthModule,
    RequestsModule,
    UsersModule,
    PlacesModule,
    WorkersModule,
    GroupsModule,
  ],
})
export class AppModule {}
