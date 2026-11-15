import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkerRatingsAndSavedWorkers1761331700000 implements MigrationInterface {
  name = 'AddWorkerRatingsAndSavedWorkers1761331700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "worker_reviews" ADD "requestId" uuid`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" ADD "attendanceStatus" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" ADD "peopleNeeded" integer`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" ADD "peopleAttended" integer`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" ADD "tags" text array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`
      ALTER TABLE "worker_reviews"
      ADD CONSTRAINT "FK_worker_reviews_booking" FOREIGN KEY ("requestId", "workerId")
      REFERENCES "bookings"("requestId", "workerId") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_worker_reviews_booking" ON "worker_reviews" ("requestId", "workerId")
      WHERE "requestId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "worker_reviews"
      ADD CONSTRAINT "CHK_worker_reviews_attendance" CHECK (
        "attendanceStatus" IS NULL OR "attendanceStatus" IN (
          'all_attended', 'fewer_attended', 'nobody_showed', 'came_late', 'everything_fine'
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "worker_reviews"
      ADD CONSTRAINT "CHK_worker_reviews_attendance_count" CHECK (
        ("attendanceStatus" IS NULL AND "peopleNeeded" IS NULL AND "peopleAttended" IS NULL)
        OR (
          "attendanceStatus" IS NOT NULL AND "peopleNeeded" IS NOT NULL AND "peopleAttended" IS NOT NULL
          AND "peopleNeeded" > 0 AND "peopleAttended" >= 0 AND "peopleAttended" <= "peopleNeeded"
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "saved_workers" (
        "farmerId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "notifyWhenAvailable" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saved_workers" PRIMARY KEY ("farmerId", "workerId"),
        CONSTRAINT "CHK_saved_workers_distinct" CHECK ("farmerId" <> "workerId"),
        CONSTRAINT "FK_saved_workers_farmer" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_saved_workers_worker" FOREIGN KEY ("workerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_saved_workers_worker" ON "saved_workers" ("workerId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_saved_workers_worker"`);
    await queryRunner.query(`DROP TABLE "saved_workers"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP CONSTRAINT "CHK_worker_reviews_attendance_count"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP CONSTRAINT "CHK_worker_reviews_attendance"`);
    await queryRunner.query(`DROP INDEX "IDX_worker_reviews_booking"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP CONSTRAINT "FK_worker_reviews_booking"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP COLUMN "tags"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP COLUMN "peopleAttended"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP COLUMN "peopleNeeded"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP COLUMN "attendanceStatus"`);
    await queryRunner.query(`ALTER TABLE "worker_reviews" DROP COLUMN "requestId"`);
  }
}
