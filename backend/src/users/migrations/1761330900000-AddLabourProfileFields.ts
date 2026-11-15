import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourProfileFields1761330900000 implements MigrationInterface {
  name = 'AddLabourProfileFields1761330900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "labourSkills" text array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourArea" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourDailyRate" integer`);
    await queryRunner.query(`ALTER TABLE "users" ADD "labourAvailable" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourAvailable"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourDailyRate"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourArea"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourSkills"`);
  }
}
