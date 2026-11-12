-- AlterTable
ALTER TABLE `InventoryTransaction` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `InventoryTransaction_idempotencyKey_key` ON `InventoryTransaction`(`idempotencyKey`);
