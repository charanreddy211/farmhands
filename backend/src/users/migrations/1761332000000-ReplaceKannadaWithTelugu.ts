import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceKannadaWithTelugu1761332000000 implements MigrationInterface {
  name = 'ReplaceKannadaWithTelugu1761332000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_preferred_language"`);
    await queryRunner.query(`UPDATE "users" SET "preferredLanguage" = 'te' WHERE "preferredLanguage" = 'kn'`);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_preferred_language" CHECK ("preferredLanguage" IN ('en', 'te'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_preferred_language"`);
    await queryRunner.query(`UPDATE "users" SET "preferredLanguage" = 'kn' WHERE "preferredLanguage" = 'te'`);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_preferred_language" CHECK ("preferredLanguage" IN ('en', 'kn'))
    `);
  }
}
