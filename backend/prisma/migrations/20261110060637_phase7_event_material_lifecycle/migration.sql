-- AlterTable
ALTER TABLE `Event` ADD COLUMN `cancellationReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledById` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `MaterialRequest` ADD COLUMN `parentRequestId` CHAR(36) NULL,
    ADD COLUMN `reason` VARCHAR(500) NULL,
    ADD COLUMN `requestType` ENUM('INITIAL', 'ADDITIONAL') NOT NULL DEFAULT 'INITIAL',
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED', 'CANCELLED_BY_EVENT') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `MaterialRequestItem` MODIFY `status` ENUM('REQUESTED', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED', 'CANCELLED_BY_EVENT') NOT NULL DEFAULT 'REQUESTED';

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `category` VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    ADD COLUMN `priority` VARCHAR(10) NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE `MaterialReturnCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialReturn` (
    `id` CHAR(36) NOT NULL,
    `returnCode` VARCHAR(30) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `requesterId` CHAR(36) NOT NULL,
    `adminId` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'PENDING_ADMIN_REVIEW', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_ADMIN_REVIEW',
    `reason` VARCHAR(50) NULL,
    `reasonNote` TEXT NULL,
    `notes` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialReturn_returnCode_key`(`returnCode`),
    INDEX `MaterialReturn_eventId_idx`(`eventId`),
    INDEX `MaterialReturn_requesterId_idx`(`requesterId`),
    INDEX `MaterialReturn_adminId_idx`(`adminId`),
    INDEX `MaterialReturn_status_idx`(`status`),
    INDEX `MaterialReturn_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialReturnItem` (
    `id` CHAR(36) NOT NULL,
    `returnId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `unitId` CHAR(36) NOT NULL,
    `issuedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `previouslyReturnedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `requestedReturnQuantity` DECIMAL(12, 3) NOT NULL,
    `acceptedReturnQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `rejectedReturnQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `reason` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaterialReturnItem_returnId_idx`(`returnId`),
    INDEX `MaterialReturnItem_foodItemId_idx`(`foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialReturnTimeline` (
    `id` CHAR(36) NOT NULL,
    `returnId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(50) NOT NULL,
    `fromStatus` VARCHAR(50) NULL,
    `toStatus` VARCHAR(50) NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MaterialReturnTimeline_returnId_createdAt_idx`(`returnId`, `createdAt`),
    INDEX `MaterialReturnTimeline_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `MaterialRequest_requestType_idx` ON `MaterialRequest`(`requestType`);

-- CreateIndex
CREATE INDEX `MaterialRequest_parentRequestId_idx` ON `MaterialRequest`(`parentRequestId`);

-- CreateIndex
CREATE INDEX `Notification_type_idx` ON `Notification`(`type`);

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_parentRequestId_fkey` FOREIGN KEY (`parentRequestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturnItem` ADD CONSTRAINT `MaterialReturnItem_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `MaterialReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturnItem` ADD CONSTRAINT `MaterialReturnItem_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturnItem` ADD CONSTRAINT `MaterialReturnItem_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturnTimeline` ADD CONSTRAINT `MaterialReturnTimeline_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `MaterialReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturnTimeline` ADD CONSTRAINT `MaterialReturnTimeline_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
