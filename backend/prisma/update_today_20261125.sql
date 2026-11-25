-- =============================================================================
-- TODAY'S COMPLETE DATABASE UPDATE (2026-11-25)
-- Safe to import directly in cPanel phpMyAdmin
-- Changes today:
--   1. Add `EVENT_CREATOR` role to `User.role` enum
--   2. Add `stockType` and `donorName` to `StockLot`
--   3. Create `EventExpense` table with foreign keys
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Add `EVENT_CREATOR` role to `User` table
ALTER TABLE `User` 
    MODIFY `role` ENUM('ADMIN', 'EXECUTOR', 'EVENT_CREATOR') NOT NULL;

-- 2. Add Stock Type (`CHARITY`, `EXPENSE`) & Donor Attribution to `StockLot`
ALTER TABLE `StockLot`
    ADD COLUMN `stockType` ENUM('CHARITY', 'EXPENSE') NULL AFTER `vendorId`,
    ADD COLUMN `donorName` VARCHAR(200) NULL AFTER `stockType`,
    ADD INDEX `StockLot_stockType_idx` (`stockType`);

-- 3. Create `EventExpense` table
CREATE TABLE IF NOT EXISTS `EventExpense` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `expenseDate` DATE NOT NULL,
    `reference` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `createdBy` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `EventExpense_eventId_idx` (`eventId`),
    INDEX `EventExpense_category_idx` (`category`),
    INDEX `EventExpense_expenseDate_idx` (`expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Add Foreign Keys for `EventExpense`
ALTER TABLE `EventExpense`
    ADD CONSTRAINT `EventExpense_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `EventExpense_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
