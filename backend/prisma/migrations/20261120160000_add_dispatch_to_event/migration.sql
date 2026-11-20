-- AlterTable
ALTER TABLE `Event` ADD COLUMN `dispatchDestination` VARCHAR(500) NULL,
    ADD COLUMN `dispatchedAt` DATETIME(3) NULL,
    ADD COLUMN `dispatchedById` CHAR(36) NULL,
    ADD COLUMN `verifiedById` CHAR(36) NULL;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
