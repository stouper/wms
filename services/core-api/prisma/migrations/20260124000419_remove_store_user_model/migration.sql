/*
  Warnings:

  - You are about to drop the `StoreUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StoreUser" DROP CONSTRAINT "StoreUser_storeId_fkey";

-- DropTable
DROP TABLE "StoreUser";
