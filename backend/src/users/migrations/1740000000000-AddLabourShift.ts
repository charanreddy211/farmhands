import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourShift1740000000000 implements MigrationInterface {
  name = 'AddLabourShift1740000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "labourShift" character varying(10) NOT NULL DEFAULT 'full_day'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "labourShift"`);
  }
}
