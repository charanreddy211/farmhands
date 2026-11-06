import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequestWorkDetails1761331400000 implements MigrationInterface {
  name = 'AddRequestWorkDetails1761331400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "workType" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "crop" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "labour_requests" ADD "farmLocationId" character varying(80)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "farmLocationId"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "crop"`);
    await queryRunner.query(`ALTER TABLE "labour_requests" DROP COLUMN "workType"`);
  }
}
