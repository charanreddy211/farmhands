import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabourAvailabilityPeopleByDate1794420000000 implements MigrationInterface {
  name = 'AddLabourAvailabilityPeopleByDate1794420000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "labourAvailablePeopleByDate" jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(`
      UPDATE "users"
      SET "labourAvailablePeopleByDate" = (
        SELECT COALESCE(jsonb_object_agg(date_value::text, '1'::jsonb), '{}'::jsonb)
        FROM unnest("labourAvailableDates") AS availability_date(date_value)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "labourAvailablePeopleByDate"`);
  }
}
