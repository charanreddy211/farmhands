import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsAndRequestExpiry1761331600000 implements MigrationInterface {
  name = 'CreateBookingsAndRequestExpiry1761331600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "expiresAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "labour_requests" SET "expiresAt" = "createdAt" + interval '6 hours'`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ALTER COLUMN "expiresAt" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ALTER COLUMN "expiresAt" SET DEFAULT (now() + interval '6 hours')`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "closeReason" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "closedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`
      ALTER TABLE "labour_requests"
      ADD CONSTRAINT "CHK_labour_requests_status" CHECK ("status" IN ('open', 'filled', 'closed', 'expired'))
    `);
    await queryRunner.query(`ALTER TABLE "request_recipients" DROP CONSTRAINT "CHK_request_recipients_status"`);
    await queryRunner.query(`
      ALTER TABLE "request_recipients"
      ADD CONSTRAINT "CHK_request_recipients_status" CHECK ("status" IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'))
    `);
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "requestId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "farmerId" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'confirmed',
        "cancellationReason" character varying(40),
        "cancelledBy" uuid,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "confirmedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("requestId", "workerId"),
        CONSTRAINT "CHK_bookings_status" CHECK ("status" IN ('confirmed', 'cancelled', 'completed')),
        CONSTRAINT "CHK_bookings_cancel_reason" CHECK ("cancellationReason" IS NULL OR "cancellationReason" IN ('plans_changed', 'found_another_worker', 'dates_changed', 'other')),
        CONSTRAINT "CHK_bookings_cancelled_fields" CHECK (("status" = 'cancelled' AND "cancellationReason" IS NOT NULL AND "cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL) OR ("status" <> 'cancelled' AND "cancellationReason" IS NULL AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL)),
        CONSTRAINT "FK_bookings_recipient" FOREIGN KEY ("requestId", "workerId") REFERENCES "request_recipients"("requestId", "workerId") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_farmer" FOREIGN KEY ("farmerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_farmer_status" ON "bookings" ("farmerId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_worker_status" ON "bookings" ("workerId", "status")`);
    await queryRunner.query(`
      INSERT INTO "bookings" ("requestId", "workerId", "farmerId")
      SELECT recipient."requestId", recipient."workerId", request."farmerId"
      FROM "request_recipients" recipient
      INNER JOIN "labour_requests" request ON request."id" = recipient."requestId"
      WHERE recipient."status" = 'accepted' AND request."farmerId" IS NOT NULL
      ON CONFLICT ("requestId", "workerId") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bookings_worker_status"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_farmer_status"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`ALTER TABLE "request_recipients" DROP CONSTRAINT "CHK_request_recipients_status"`);
    await queryRunner.query(`
      ALTER TABLE "request_recipients"
      ADD CONSTRAINT "CHK_request_recipients_status" CHECK ("status" IN ('pending', 'accepted', 'declined'))
    `);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP CONSTRAINT "CHK_labour_requests_status"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "closedAt"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "closeReason"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "expiresAt"`);
  }
}
