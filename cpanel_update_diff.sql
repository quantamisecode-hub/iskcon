-- =============================================================================
-- FOOD INVENTORY SYSTEM: INCREMENTAL UPDATE DIFF FOR CPANEL (phpMyAdmin)
-- Applies all migrations introduced in main branch commit a68b704
-- Target: Database quanusse_iskon
-- Date: 2026-11-20
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- Migration: 20261120143800_add_donation_to_event
-- -----------------------------------------------------------------------------
-- Add donation fields to Event model
ALTER TABLE `Event` ADD COLUMN `donationAmount` DECIMAL(12, 2) NULL;
ALTER TABLE `Event` ADD COLUMN `donationGivenBy` VARCHAR(200) NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20261120150000_remove_event_end_time
-- -----------------------------------------------------------------------------
ALTER TABLE `Event` DROP COLUMN `endTime`;

-- -----------------------------------------------------------------------------
-- Migration: 20261120160000_add_dispatch_to_event
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `dispatchDestination` VARCHAR(500) NULL,
    ADD COLUMN `dispatchedAt` DATETIME(3) NULL,
    ADD COLUMN `dispatchedById` CHAR(36) NULL,
    ADD COLUMN `verifiedById` CHAR(36) NULL;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20261120170000_add_vendors
-- -----------------------------------------------------------------------------
-- CreateTable
CREATE TABLE `Vendor` (
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

-- AlterTable
ALTER TABLE `InventoryTransaction` ADD COLUMN `vendorId` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `InventoryTransaction_vendorId_idx` ON `InventoryTransaction`(`vendorId`);

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Migration: 20261120180000_add_event_dish_quantity
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE `EventDish` ADD COLUMN `quantity` DECIMAL(12, 3) NULL,
    ADD COLUMN `quantityUnit` VARCHAR(20) NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20261120190000_add_event_type_and_contact
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `eventType` VARCHAR(50) NULL,
    ADD COLUMN `servingType` VARCHAR(20) NULL,
    ADD COLUMN `contactPerson` VARCHAR(100) NULL,
    ADD COLUMN `mobileNumber` VARCHAR(30) NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20261120195000_add_event_tr_number
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `trNumber` VARCHAR(50) NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20261120200000_add_event_donation_type
-- -----------------------------------------------------------------------------
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `donationType` VARCHAR(20) NULL;

-- -----------------------------------------------------------------------------
-- Migration: 20261120210000_add_fifo_stock_lots
-- -----------------------------------------------------------------------------
-- FIFO lot-based inventory architecture.

-- AlterTable: adopt decimal quantities everywhere.
ALTER TABLE `Inventory` MODIFY `currentQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE `InventoryTransaction`
  MODIFY `quantity` DECIMAL(12, 3) NOT NULL,
  MODIFY `balanceBefore` DECIMAL(12, 3) NOT NULL,
  MODIFY `balanceAfter` DECIMAL(12, 3) NOT NULL,
  ADD COLUMN `unitCost` DECIMAL(12, 2) NULL,
  ADD COLUMN `totalCost` DECIMAL(14, 2) NULL,
  ADD COLUMN `stockLotId` CHAR(36) NULL;

-- CreateTable: server-generated lot number allocator.
CREATE TABLE `StockLotCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: one acquisition of an item. FIFO consumes oldest received first.
CREATE TABLE `StockLot` (
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

-- CreateTable: immutable FIFO consumption record.
CREATE TABLE `StockAllocation` (
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

-- AddForeignKey
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing balances honestly: no purchase date or cost was recorded,
-- so these are OPENING_BALANCE lots with NULL cost (never invented prices).
SET @fifo_rn := 0;
INSERT INTO `StockLot`
  (`id`, `lotNumber`, `foodItemId`, `receivedDate`, `quantityReceived`, `quantityRemaining`,
   `status`, `referenceType`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  CONCAT('LOT-OPEN-', DATE_FORMAT(CURDATE(), '%Y%m%d'), '-', LPAD(@fifo_rn := @fifo_rn + 1, 4, '0')),
  `i`.`foodItemId`,
  CURDATE(),
  `i`.`currentQuantity`,
  `i`.`currentQuantity`,
  'AVAILABLE',
  'OPENING_BALANCE',
  NOW(),
  NOW()
FROM `Inventory` `i`
WHERE `i`.`currentQuantity` > 0;

-- -----------------------------------------------------------------------------
-- Record new migrations in _prisma_migrations so Prisma remains in sync
-- -----------------------------------------------------------------------------
INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES
  ('3e82f1a4-adc9-4721-99c4-d4b4fac72596', 'cf98d6244e75501d27f43f5c97d62e1b59d49caf48bdb7661a534ea7648b1dce', '2026-11-20 15:15:48.971', '20261120143800_add_donation_to_event', NULL, NULL, '2026-11-20 15:15:48.971', 1),
  ('2db6848d-c9b6-457d-a1c3-e8a77d6bf7b4', 'ff9f6268496e5e37815de7acb096a2340a3bf514ac5604d49e372873190548ab', '2026-11-20 15:15:48.976', '20261120150000_remove_event_end_time', NULL, NULL, '2026-11-20 15:15:48.976', 1),
  ('1fe2bd66-4770-4b30-acdc-2e2e53551f92', 'd202466785b9eda5e88fd8761e92da35959d82486b7b972c1ea4b9692ef229a0', '2026-11-20 15:15:48.976', '20261120160000_add_dispatch_to_event', NULL, NULL, '2026-11-20 15:15:48.976', 1),
  ('d8ace962-b143-48fd-a14d-805a78a2fe0f', '258c4b43651babde6077f4290c7b3f1b36c4b80310026ce8734f24ceab17b54f', '2026-11-20 15:15:48.977', '20261120170000_add_vendors', NULL, NULL, '2026-11-20 15:15:48.977', 1),
  ('d1534642-d8ba-470f-8f35-cd1ca98133f3', '2c1a4758913e1ab0d1797662b7ca8bfa3c630258d013629a34a955ce94c860ba', '2026-11-20 15:15:48.977', '20261120180000_add_event_dish_quantity', NULL, NULL, '2026-11-20 15:15:48.977', 1),
  ('24ea38c2-e66b-44f5-b964-1002d82d5eb1', '9962e1a4eb6705ac3c046b46f2bf86a16095c7f5a828886cbad9a00b9b75ee2c', '2026-11-20 15:15:48.977', '20261120190000_add_event_type_and_contact', NULL, NULL, '2026-11-20 15:15:48.977', 1),
  ('d8fcdb78-3f89-4c58-a150-65ce1efad69a', '44455ad3fd2793257a2c1c90ec35f3ff826d51825551681eab360ea505b34778', '2026-11-20 15:15:48.978', '20261120195000_add_event_tr_number', NULL, NULL, '2026-11-20 15:15:48.978', 1),
  ('9d2a84d9-1000-4688-b4ae-7820899e9312', 'd325ebab64733112040e43d90e2b925e0b70ddec69942f54e19247bd929067cf', '2026-11-20 15:15:48.978', '20261120200000_add_event_donation_type', NULL, NULL, '2026-11-20 15:15:48.978', 1),
  ('e16e7506-2fb6-4a1b-8356-bde72a1b68d4', 'be0e27b5eb0f7a714a48d471dc26448467e0fba8b73d5792aee308c611d83b5d', '2026-11-20 15:15:48.979', '20261120210000_add_fifo_stock_lots', NULL, NULL, '2026-11-20 15:15:48.979', 1);

SET FOREIGN_KEY_CHECKS = 1;
