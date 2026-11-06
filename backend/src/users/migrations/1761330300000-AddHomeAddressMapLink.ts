import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHomeAddressMapLink1761330300000 implements MigrationInterface {
  name = 'AddHomeAddressMapLink1761330300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "homeAddressMapLink" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "homeAddressMapLink"`);
  }
}
