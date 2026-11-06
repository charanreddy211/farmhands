import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerSearchData1761331300000 implements MigrationInterface {
  name = 'AddWorkerSearchData1761331300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "labour_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(160) NOT NULL,
        "area" character varying(160) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "peopleNeeded" integer NOT NULL,
        "payPerDay" integer NOT NULL,
        "imageUrl" text,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labour_requests_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourLatitude" double precision`);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourLongitude" double precision`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "farmerId" uuid`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "workerIds" uuid array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`
      ALTER TABLE "labour_requests"
      ADD CONSTRAINT "FK_labour_requests_farmer" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "worker_reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workerId" uuid NOT NULL,
        "farmerId" uuid NOT NULL,
        "rating" integer NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_worker_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_worker_reviews_worker" FOREIGN KEY ("workerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_worker_reviews_farmer" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_worker_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_worker_reviews_worker_created" ON "worker_reviews" ("workerId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_worker_reviews_farmer_worker" ON "worker_reviews" ("farmerId", "workerId")`);
    await queryRunner.query(`
      CREATE TABLE "worker_search_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "farmerId" uuid NOT NULL,
        "from" date NOT NULL,
        "to" date NOT NULL,
        "latitude" double precision,
        "longitude" double precision,
        "maxDistanceKm" integer,
        "minRating" double precision,
        "skill" text,
        "query" text,
        "workedWithMe" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_worker_search_alerts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_worker_search_alerts_farmer" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_worker_search_alerts_farmer" ON "worker_search_alerts" ("farmerId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_worker_search_alerts_farmer"`);
    await queryRunner.query(`DROP TABLE "worker_search_alerts"`);
    await queryRunner.query(`DROP INDEX "IDX_worker_reviews_farmer_worker"`);
    await queryRunner.query(`DROP INDEX "IDX_worker_reviews_worker_created"`);
    await queryRunner.query(`DROP TABLE "worker_reviews"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP CONSTRAINT "FK_labour_requests_farmer"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "workerIds"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "farmerId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourLongitude"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourLatitude"`);
  }
}
