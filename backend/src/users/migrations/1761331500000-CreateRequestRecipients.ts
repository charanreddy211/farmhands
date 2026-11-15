import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequestRecipients1761331500000 implements MigrationInterface {
  name = 'CreateRequestRecipients1761331500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "request_recipients" (
        "requestId" uuid NOT NULL,
        "workerId" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "declineReason" character varying(40),
        "respondedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_request_recipients" PRIMARY KEY ("requestId", "workerId"),
        CONSTRAINT "CHK_request_recipients_status" CHECK ("status" IN ('pending', 'accepted', 'declined')),
        CONSTRAINT "CHK_request_recipients_decline_reason" CHECK ("declineReason" IS NULL OR "declineReason" IN ('already_booked', 'too_far', 'pay_too_low', 'not_available')),
        CONSTRAINT "CHK_request_recipients_response" CHECK (("status" = 'declined' AND "declineReason" IS NOT NULL) OR ("status" <> 'declined' AND "declineReason" IS NULL)),
        CONSTRAINT "FK_request_recipients_request" FOREIGN KEY ("requestId") REFERENCES "labour_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_request_recipients_worker" FOREIGN KEY ("workerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_request_recipients_worker_status" ON "request_recipients" ("workerId", "status")`);
    await queryRunner.query(`
      INSERT INTO "request_recipients" ("requestId", "workerId")
      SELECT request."id", workers."workerId"
      FROM "labour_requests" request
      CROSS JOIN LATERAL unnest(request."workerIds") AS workers("workerId")
      INNER JOIN "users" worker ON worker."id" = workers."workerId"
      ON CONFLICT ("requestId", "workerId") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_request_recipients_worker_status"`);
    await queryRunner.query(`DROP TABLE "request_recipients"`);
  }
}
