-- STOCK TYPE (CHARITY / EXPENSE) + ADMIN EVENT EXPENSES
-- StockLot is the single source of truth for the financial classification.
-- The column is intentionally NULLABLE: legacy / opening-balance lots have no
-- known classification and must never be silently labelled as charity or expense.
-- New Stock Inward records always supply an explicit value (server validated).

ALTER TABLE `StockLot`
    ADD COLUMN `stockType` ENUM('CHARITY', 'EXPENSE') NULL;

CREATE INDEX `StockLot_stockType_idx` ON `StockLot`(`stockType`);

-- Non-inventory event expenses. No equivalent table existed before this migration.
CREATE TABLE `EventExpense` (
    `id` VARCHAR(191) NOT NULL,
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

    PRIMARY KEY (`id`),
    INDEX `EventExpense_eventId_idx`(`eventId`),
    INDEX `EventExpense_category_idx`(`category`),
    INDEX `EventExpense_expenseDate_idx`(`expenseDate`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EventExpense` ADD CONSTRAINT `EventExpense_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EventExpense` ADD CONSTRAINT `EventExpense_createdBy_fkey`
    FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
