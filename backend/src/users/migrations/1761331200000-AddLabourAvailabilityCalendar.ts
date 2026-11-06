import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourAvailabilityCalendar1761331200000 implements MigrationInterface {
  name = 'AddLabourAvailabilityCalendar1761331200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "labourTravelRadius" integer`);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourAvailableDates" date array NOT NULL DEFAULT '{}'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourAvailableDates"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourTravelRadius"`);
  }
}
