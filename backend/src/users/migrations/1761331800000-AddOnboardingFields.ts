import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingFields1761331800000 implements MigrationInterface {
  name = 'AddOnboardingFields1761331800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "preferredLanguage" character varying(5) NOT NULL DEFAULT 'en'`);
    await queryRunner.query(`ALTER TABLE "users" ADD "onboardingComplete" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      UPDATE "users"
      SET "onboardingComplete" = true
      WHERE cardinality("roles") > 0 AND "firstName" <> ''
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_preferred_language" CHECK ("preferredLanguage" IN ('en', 'kn'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "CHK_users_preferred_language"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "onboardingComplete"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferredLanguage"`);
  }
}
