import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequestImageUrl1761330600000 implements MigrationInterface {
  name = 'AddRequestImageUrl1761330600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "imageUrl" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "imageUrl"`);
  }
}
