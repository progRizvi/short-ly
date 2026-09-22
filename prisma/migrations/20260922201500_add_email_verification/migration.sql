-- AlterTable
ALTER TABLE `User` ADD COLUMN `isVerified` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `User` ADD COLUMN `verificationToken` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `verificationTokenExpiresAt` DATETIME(3) NULL;
CREATE UNIQUE INDEX `User_verificationToken_key` ON `User`(`verificationToken`);
