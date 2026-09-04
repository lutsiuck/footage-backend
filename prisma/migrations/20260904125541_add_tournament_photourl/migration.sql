/*
  Warnings:

  - The values [pending] on the enum `MembershipStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MembershipStatus_new" AS ENUM ('invited', 'requested', 'approved');
ALTER TABLE "team_members" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TABLE "tournament_teams" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "public"."MembershipStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "photo_url" TEXT;
