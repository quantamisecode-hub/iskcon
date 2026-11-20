-- =============================================================================
-- FIX 500 INTERNAL_ERROR: ADD MISSING COLUMNS & TABLES
-- Pure standard SQL queries - 100% compatible with phpMyAdmin and cPanel MySQL.
-- Run these queries on your database (e.g., quanusse_iskon).
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. ADD MISSING COLUMNS TO `Event` (Fixes /api/v1/dashboard/summary 500 error)
-- -----------------------------------------------------------------------------
ALTER TABLE `Event` 
    ADD COLUMN `donationAmount` DECIMAL(12, 2) NULL,
    ADD COLUMN `donationGivenBy` VARCHAR(200) NULL,
    ADD COLUMN `trNumber` VARCHAR(50) NULL,
    ADD COLUMN `donationType` VARCHAR(20) NULL,
    ADD COLUMN `eventType` VARCHAR(50) NULL,
    ADD COLUMN `servingType` VARCHAR(20) NULL,
    ADD COLUMN `contactPerson` VARCHAR(100) NULL,
    ADD COLUMN `mobileNumber` VARCHAR(30) NULL,
    ADD COLUMN `dispatchDestination` VARCHAR(500) NULL,
    ADD COLUMN `dispatchedAt` DATETIME(3) NULL,
    ADD COLUMN `dispatchedById` CHAR(36) NULL,
    ADD COLUMN `verifiedById` CHAR(36) NULL;

-- -----------------------------------------------------------------------------
-- 2. ADD FOREIGN KEYS FOR `Event`
-- -----------------------------------------------------------------------------
ALTER TABLE `Event` 
    ADD CONSTRAINT `Event_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `Event_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 3. ADD MISSING COLUMNS TO `EventDish`
-- -----------------------------------------------------------------------------
ALTER TABLE `EventDish` 
    ADD COLUMN `quantity` DECIMAL(12, 3) NULL,
    ADD COLUMN `quantityUnit` VARCHAR(20) NULL;

-- -----------------------------------------------------------------------------
-- 4. UPDATE `Inventory` FOR DECIMAL PRECISION
-- -----------------------------------------------------------------------------
ALTER TABLE `Inventory` 
    MODIFY `currentQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 5. UPDATE `InventoryTransaction` COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE `InventoryTransaction`
    MODIFY `quantity` DECIMAL(12, 3) NOT NULL,
    MODIFY `balanceBefore` DECIMAL(12, 3) NOT NULL,
    MODIFY `balanceAfter` DECIMAL(12, 3) NOT NULL,
    ADD COLUMN `vendorId` CHAR(36) NULL,
    ADD COLUMN `unitCost` DECIMAL(12, 2) NULL,
    ADD COLUMN `totalCost` DECIMAL(14, 2) NULL,
    ADD COLUMN `stockLotId` CHAR(36) NULL;

-- -----------------------------------------------------------------------------
-- 6. CREATE `Vendor` TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Vendor` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `contactPerson` VARCHAR(100) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(255) NULL,
    `address` VARCHAR(500) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `gstNumber` VARCHAR(15) NULL,
    `paymentTerms` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vendor_name_key`(`name`),
    INDEX `Vendor_isActive_idx`(`isActive`),
    INDEX `Vendor_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InventoryTransaction` 
    ADD CONSTRAINT `InventoryTransaction_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 7. CREATE FIFO STOCK TABLES (`StockLotCodeCounter`, `StockLot`, `StockAllocation`)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `StockLotCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockLot` (
    `id` CHAR(36) NOT NULL,
    `lotNumber` VARCHAR(50) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `vendorId` CHAR(36) NULL,
    `purchaseDate` DATE NULL,
    `receivedDate` DATE NOT NULL,
    `quantityReceived` DECIMAL(12, 3) NOT NULL,
    `quantityRemaining` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 2) NULL,
    `totalCost` DECIMAL(14, 2) NULL,
    `status` VARCHAR(30) NOT NULL,
    `referenceType` VARCHAR(40) NULL,
    `referenceId` CHAR(36) NULL,
    `createdBy` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockLot_lotNumber_key`(`lotNumber`),
    INDEX `StockLot_fifo_idx`(`foodItemId`, `status`, `receivedDate`, `createdAt`),
    INDEX `StockLot_vendorId_idx`(`vendorId`),
    INDEX `StockLot_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StockAllocation` (
    `id` CHAR(36) NOT NULL,
    `stockLotId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `transactionId` CHAR(36) NULL,
    `requestId` CHAR(36) NULL,
    `eventId` CHAR(36) NULL,
    `quantityAllocated` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 2) NULL,
    `totalCost` DECIMAL(14, 2) NULL,
    `allocatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` CHAR(36) NULL,

    INDEX `StockAllocation_stockLotId_idx`(`stockLotId`),
    INDEX `StockAllocation_foodItemId_idx`(`foodItemId`),
    INDEX `StockAllocation_requestId_idx`(`requestId`),
    INDEX `StockAllocation_eventId_idx`(`eventId`),
    INDEX `StockAllocation_transactionId_idx`(`transactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. ADD FOREIGN KEYS FOR FIFO STOCK LOTS
-- -----------------------------------------------------------------------------
ALTER TABLE `StockLot` 
    ADD CONSTRAINT `StockLot_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `StockLot_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `StockLot_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `StockAllocation` 
    ADD CONSTRAINT `StockAllocation_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `StockAllocation_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `StockAllocation_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `InventoryTransaction` 
    ADD CONSTRAINT `InventoryTransaction_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 9. OPTIONAL: DROP OBSOLETE endTime COLUMN (IF PRESENT)
-- If this fails because endTime does not exist, you can safely ignore this line.
-- -----------------------------------------------------------------------------
ALTER TABLE `Event` DROP COLUMN `endTime`;

SET FOREIGN_KEY_CHECKS = 1;
