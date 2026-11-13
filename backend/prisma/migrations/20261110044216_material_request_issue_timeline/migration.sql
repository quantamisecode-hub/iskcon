-- AlterTable
ALTER TABLE `MaterialRequest` ADD COLUMN `issuedAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `MaterialRequestItem` ADD COLUMN `approvedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `dishId` CHAR(36) NULL,
    ADD COLUMN `issuedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `rejectedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `remarks` TEXT NULL,
    ADD COLUMN `requestedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `status` ENUM('REQUESTED', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED';

-- CreateTable
CREATE TABLE `MaterialRequestTimeline` (
    `id` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(50) NOT NULL,
    `fromStatus` VARCHAR(50) NULL,
    `toStatus` VARCHAR(50) NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MaterialRequestTimeline_requestId_createdAt_idx`(`requestId`, `createdAt`),
    INDEX `MaterialRequestTimeline_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `MaterialRequestItem_dishId_idx` ON `MaterialRequestItem`(`dishId`);

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `Dish`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestTimeline` ADD CONSTRAINT `MaterialRequestTimeline_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestTimeline` ADD CONSTRAINT `MaterialRequestTimeline_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
