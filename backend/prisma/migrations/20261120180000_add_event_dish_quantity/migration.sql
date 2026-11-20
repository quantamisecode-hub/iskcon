-- AlterTable
ALTER TABLE `EventDish` ADD COLUMN `quantity` DECIMAL(12, 3) NULL,
    ADD COLUMN `quantityUnit` VARCHAR(20) NULL;
