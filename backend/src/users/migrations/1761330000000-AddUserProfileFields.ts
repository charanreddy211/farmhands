import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1761330000000 implements MigrationInterface {
  name = 'AddUserProfileFields1761330000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "firstName" character varying(80) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "users" ADD "lastName" character varying(80) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "users" ADD "email" character varying(254)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "homeAddress" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "users" ADD "profileImageUrl" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD "roles" text array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "users" ADD "farms" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "farms"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roles"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profileImageUrl"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "homeAddress"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
  }
}
