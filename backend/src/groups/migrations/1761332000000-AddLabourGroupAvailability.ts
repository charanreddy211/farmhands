import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourGroupAvailability1761332000000 implements MigrationInterface {
  name = 'AddLabourGroupAvailability1761332000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_groups" ADD "availableMemberNames" text array`);
    await queryRunner.query(`ALTER TABLE "labour_groups" ADD "workAsGroup" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`UPDATE "labour_groups" SET "availableMemberNames" = "memberNames"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_groups" DROP COLUMN "workAsGroup"`);
    await queryRunner.query(`ALTER TABLE "labour_groups" DROP COLUMN "availableMemberNames"`);
  }
}
