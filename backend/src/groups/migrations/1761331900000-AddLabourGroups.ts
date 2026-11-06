import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourGroups1761331900000 implements MigrationInterface {
  name = 'AddLabourGroups1761331900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "labour_groups" (
        "leaderId" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "memberNames" text array NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labour_groups" PRIMARY KEY ("leaderId"),
        CONSTRAINT "FK_labour_groups_leader" FOREIGN KEY ("leaderId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "peopleCount" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ADD CONSTRAINT "CHK_bookings_people_count" CHECK ("peopleCount" > 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_people_count"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "peopleCount"`);
    await queryRunner.query(`DROP TABLE "labour_groups"`);
  }
}
