-- AlterTable
ALTER TABLE `Event` ADD COLUMN `eventType` VARCHAR(50) NULL,
    ADD COLUMN `servingType` VARCHAR(20) NULL,
    ADD COLUMN `contactPerson` VARCHAR(100) NULL,
    ADD COLUMN `mobileNumber` VARCHAR(30) NULL;
