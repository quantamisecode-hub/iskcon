-- =============================================================================
-- FIX 500 ERROR ON /ledger AND /financial/summary
-- Safe to run in cPanel phpMyAdmin (MariaDB / MySQL)
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. ADD MISSING COLUMNS TO `StockLot`
-- (Required by both /api/v1/ledger and /api/v1/financial/summary)
ALTER TABLE `StockLot` 
    ADD COLUMN IF NOT EXISTS `stockType` ENUM('CHARITY', 'EXPENSE') NULL,
    ADD COLUMN IF NOT EXISTS `donorName` VARCHAR(200) NULL;

-- 2. ADD MISSING COLUMNS TO `InventoryTransaction`
-- (Required by /api/v1/ledger to join StockLot)
ALTER TABLE `InventoryTransaction`
    ADD COLUMN IF NOT EXISTS `stockLotId` CHAR(36) NULL,
    ADD COLUMN IF NOT EXISTS `vendorId` CHAR(36) NULL,
    ADD COLUMN IF NOT EXISTS `unitCost` DECIMAL(12, 2) NULL,
    ADD COLUMN IF NOT EXISTS `totalCost` DECIMAL(14, 2) NULL;

-- 3. CREATE `EventExpense` TABLE
-- (Required by /api/v1/financial/summary for event expense grouping)
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

-- 4. ADD FOREIGN KEYS (Ignore if already exist)
ALTER TABLE `EventExpense`
    ADD CONSTRAINT `EventExpense_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
