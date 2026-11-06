import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFarmhandsBaseTables1761330800000 implements MigrationInterface {
  name = 'CreateFarmhandsBaseTables1761330800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying(30) NOT NULL,
        "firstName" character varying(80) NOT NULL DEFAULT '',
        "lastName" character varying(80) NOT NULL DEFAULT '',
        "email" character varying(254),
        "homeAddress" text NOT NULL DEFAULT '',
        "homeAddressMapLink" text,
        "profileImageUrl" text,
        "roles" text array NOT NULL DEFAULT '{}',
        "farms" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastLoginAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "labour_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(160) NOT NULL,
        "area" character varying(160) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "peopleNeeded" integer NOT NULL,
        "payPerDay" integer NOT NULL,
        "imageUrl" text,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labour_requests_id" PRIMARY KEY ("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "labour_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
