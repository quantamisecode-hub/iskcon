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
