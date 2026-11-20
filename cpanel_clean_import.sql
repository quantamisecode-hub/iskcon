-- COMPLETE CPANEL SCHEMA & SEED (PascalCase for Linux MySQL)
-- Idempotent: cleanly drops both lowercase and PascalCase tables before recreating
SET FOREIGN_KEY_CHECKS = 0;

-- Clean up existing tables
DROP TABLE IF EXISTS `User`;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `Session`;
DROP TABLE IF EXISTS `session`;
DROP TABLE IF EXISTS `AdminExecutorAssignment`;
DROP TABLE IF EXISTS `adminexecutorassignment`;
DROP TABLE IF EXISTS `AuditLog`;
DROP TABLE IF EXISTS `auditlog`;
DROP TABLE IF EXISTS `Category`;
DROP TABLE IF EXISTS `category`;
DROP TABLE IF EXISTS `Unit`;
DROP TABLE IF EXISTS `unit`;
DROP TABLE IF EXISTS `FoodItem`;
DROP TABLE IF EXISTS `fooditem`;
DROP TABLE IF EXISTS `Inventory`;
DROP TABLE IF EXISTS `inventory`;
DROP TABLE IF EXISTS `InventoryTransaction`;
DROP TABLE IF EXISTS `inventorytransaction`;
DROP TABLE IF EXISTS `Event`;
DROP TABLE IF EXISTS `event`;
DROP TABLE IF EXISTS `EventCodeCounter`;
DROP TABLE IF EXISTS `eventcodecounter`;
DROP TABLE IF EXISTS `Dish`;
DROP TABLE IF EXISTS `dish`;
DROP TABLE IF EXISTS `DishMaterial`;
DROP TABLE IF EXISTS `dishmaterial`;
DROP TABLE IF EXISTS `EventDish`;
DROP TABLE IF EXISTS `eventdish`;
DROP TABLE IF EXISTS `EventMaterial`;
DROP TABLE IF EXISTS `eventmaterial`;
DROP TABLE IF EXISTS `MaterialRequestCodeCounter`;
DROP TABLE IF EXISTS `materialrequestcodecounter`;
DROP TABLE IF EXISTS `MaterialRequest`;
DROP TABLE IF EXISTS `materialrequest`;
DROP TABLE IF EXISTS `MaterialRequestItem`;
DROP TABLE IF EXISTS `materialrequestitem`;
DROP TABLE IF EXISTS `MaterialRequestTimeline`;
DROP TABLE IF EXISTS `materialrequesttimeline`;
DROP TABLE IF EXISTS `Notification`;
DROP TABLE IF EXISTS `notification`;
DROP TABLE IF EXISTS `MaterialReturnCodeCounter`;
DROP TABLE IF EXISTS `materialreturncodecounter`;
DROP TABLE IF EXISTS `MaterialReturn`;
DROP TABLE IF EXISTS `materialreturn`;
DROP TABLE IF EXISTS `MaterialReturnItem`;
DROP TABLE IF EXISTS `materialreturnitem`;
DROP TABLE IF EXISTS `MaterialReturnTimeline`;
DROP TABLE IF EXISTS `materialreturntimeline`;
DROP TABLE IF EXISTS `_prisma_migrations`;

-- Prisma migrations tracking table
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text DEFAULT NULL,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `applied_steps_count` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: 20261109071631_init_core_security_models
-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'EXECUTOR') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminExecutorAssignment` (
    `id` CHAR(36) NOT NULL,
    `adminId` CHAR(36) NOT NULL,
    `executorId` CHAR(36) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unassignedAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AdminExecutorAssignment_adminId_isActive_idx`(`adminId`, `isActive`),
    INDEX `AdminExecutorAssignment_executorId_isActive_idx`(`executorId`, `isActive`),
    INDEX `AdminExecutorAssignment_assignedAt_idx`(`assignedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `action` VARCHAR(50) NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `oldValues` JSON NULL,
    `newValues` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminExecutorAssignment` ADD CONSTRAINT `AdminExecutorAssignment_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminExecutorAssignment` ADD CONSTRAINT `AdminExecutorAssignment_executorId_fkey` FOREIGN KEY (`executorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration: 20261109080237_add_inventory_master
-- CreateTable
CREATE TABLE `Category` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Unit` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `unitType` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Unit_name_key`(`name`),
    UNIQUE INDEX `Unit_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FoodItem` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(191) NULL,
    `categoryId` CHAR(36) NOT NULL,
    `unitId` CHAR(36) NOT NULL,
    `minimumStock` INTEGER NOT NULL,
    `reorderLevel` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FoodItem_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inventory` (
    `id` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `currentQuantity` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Inventory_foodItemId_key`(`foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryTransaction` (
    `id` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `transactionType` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `balanceBefore` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `performedBy` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryTransaction_foodItemId_idx`(`foodItemId`),
    INDEX `InventoryTransaction_transactionType_idx`(`transactionType`),
    INDEX `InventoryTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FoodItem` ADD CONSTRAINT `FoodItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FoodItem` ADD CONSTRAINT `FoodItem_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Migration: 20261109094219_add_phase4_events_dishes
-- CreateTable
CREATE TABLE `Event` (
    `id` CHAR(36) NOT NULL,
    `eventCode` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `eventDate` DATE NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NULL,
    `numberOfPeople` INTEGER NOT NULL,
    `location` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `status` ENUM('DRAFT', 'PLANNING', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `adminId` CHAR(36) NOT NULL,
    `createdBy` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Event_eventCode_key`(`eventCode`),
    INDEX `Event_adminId_idx`(`adminId`),
    INDEX `Event_createdBy_idx`(`createdBy`),
    INDEX `Event_status_idx`(`status`),
    INDEX `Event_eventDate_idx`(`eventDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dish` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Dish_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DishMaterial` (
    `id` CHAR(36) NOT NULL,
    `dishId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `quantityPerPerson` DECIMAL(10, 3) NULL,
    `unitId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DishMaterial_dishId_idx`(`dishId`),
    INDEX `DishMaterial_foodItemId_idx`(`foodItemId`),
    UNIQUE INDEX `DishMaterial_dishId_foodItemId_key`(`dishId`, `foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventDish` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `dishId` CHAR(36) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventDish_eventId_idx`(`eventId`),
    UNIQUE INDEX `EventDish_eventId_dishId_key`(`eventId`, `dishId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventMaterial` (
    `id` CHAR(36) NOT NULL,
    `eventDishId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `plannedQuantity` DECIMAL(12, 3) NOT NULL,
    `unitId` CHAR(36) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventMaterial_eventDishId_idx`(`eventDishId`),
    UNIQUE INDEX `EventMaterial_eventDishId_foodItemId_key`(`eventDishId`, `foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DishMaterial` ADD CONSTRAINT `DishMaterial_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `Dish`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DishMaterial` ADD CONSTRAINT `DishMaterial_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DishMaterial` ADD CONSTRAINT `DishMaterial_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventDish` ADD CONSTRAINT `EventDish_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventDish` ADD CONSTRAINT `EventDish_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `Dish`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMaterial` ADD CONSTRAINT `EventMaterial_eventDishId_fkey` FOREIGN KEY (`eventDishId`) REFERENCES `EventDish`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMaterial` ADD CONSTRAINT `EventMaterial_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMaterial` ADD CONSTRAINT `EventMaterial_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration: 20261109105428_add_user_avatar_profile
-- AlterTable
ALTER TABLE `User` ADD COLUMN `avatarUrl` MEDIUMTEXT NULL;


-- Migration: 20261109122905_event_material_is_draft
-- AlterTable
ALTER TABLE `EventMaterial` ADD COLUMN `isDraft` BOOLEAN NOT NULL DEFAULT false;


-- Migration: 20261109131317_material_requests_notifications
-- CreateTable
CREATE TABLE `MaterialRequestCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialRequest` (
    `id` CHAR(36) NOT NULL,
    `requestCode` VARCHAR(30) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `requestedById` CHAR(36) NOT NULL,
    `adminId` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `approverId` CHAR(36) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialRequest_requestCode_key`(`requestCode`),
    INDEX `MaterialRequest_eventId_idx`(`eventId`),
    INDEX `MaterialRequest_requestedById_idx`(`requestedById`),
    INDEX `MaterialRequest_adminId_idx`(`adminId`),
    INDEX `MaterialRequest_status_idx`(`status`),
    INDEX `MaterialRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialRequestItem` (
    `id` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `plannedQuantity` DECIMAL(12, 3) NOT NULL,
    `unitId` CHAR(36) NOT NULL,
    `sourceEventMaterialId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaterialRequestItem_requestId_idx`(`requestId`),
    INDEX `MaterialRequestItem_foodItemId_idx`(`foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `referenceType` VARCHAR(50) NULL,
    `referenceId` CHAR(36) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_sourceEventMaterialId_fkey` FOREIGN KEY (`sourceEventMaterialId`) REFERENCES `EventMaterial`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Migration: 20261110044216_material_request_issue_timeline
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


-- Migration: 20261110044500_backfill_request_item_quantities
-- Backfill item quantities for requests created before Phase 7.
-- Historical requests treated their planned quantity as the requested quantity.
UPDATE `MaterialRequestItem`
SET `requestedQuantity` = `plannedQuantity`
WHERE `requestedQuantity` = 0;

-- Derive the dish for historical lines from the event-material source.
UPDATE `MaterialRequestItem` i
JOIN `EventMaterial` em ON em.`id` = i.`sourceEventMaterialId`
JOIN `EventDish` ed ON ed.`id` = em.`eventDishId`
SET i.`dishId` = ed.`dishId`
WHERE i.`dishId` IS NULL;

-- Approved requests: planned quantity was implicitly approved.
UPDATE `MaterialRequestItem` i
JOIN `MaterialRequest` r ON r.`id` = i.`requestId`
SET i.`approvedQuantity` = i.`plannedQuantity`,
    i.`status` = 'APPROVED'
WHERE r.`status` IN ('APPROVED', 'PARTIALLY_ISSUED', 'ISSUED')
  AND i.`approvedQuantity` = 0;

-- Fully issued requests (reserved status was unused before Phase 7).
UPDATE `MaterialRequestItem` i
JOIN `MaterialRequest` r ON r.`id` = i.`requestId`
SET i.`issuedQuantity` = i.`approvedQuantity`,
    i.`status` = 'ISSUED'
WHERE r.`status` = 'ISSUED';


-- Migration: 20261110060637_phase7_event_material_lifecycle
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


-- Migration: 20261112110500_inventory_transaction_idempotency_key
-- AlterTable
ALTER TABLE `InventoryTransaction` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `InventoryTransaction_idempotencyKey_key` ON `InventoryTransaction`(`idempotencyKey`);


INSERT INTO `_prisma_migrations` VALUES ('0a51d0b2-a3e4-48b1-a516-377aacbbc0d7','bcd6138370814789cb9979ad96d4bc83a448e81c0ae13360e1f6e7fcfbd2f835','2026-11-12 16:46:08.917','20261109105428_add_user_avatar_profile',NULL,NULL,'2026-11-12 16:46:08.897',1),('7b33546d-c514-4a3c-9b50-cfe4b5c170fc','1a4e7310ea144ab657786f2d42ae34786c7ab2c18131fefb29371b67c2d367e1','2026-11-12 16:46:08.057','20261109080237_add_inventory_master',NULL,NULL,'2026-11-12 16:46:07.640',1),('99c407ce-0df6-4554-a93c-86506f96bb45','4711cf96b87fb991310782a07c2d0c26cb799cda8ae09451603f9aaca8793ace','2026-11-12 16:46:10.857','20261110060637_phase7_event_material_lifecycle',NULL,NULL,'2026-11-12 16:46:09.982',1),('a136a197-97f5-4b2c-8186-2b501b6775e1','ddf68abb02fb9b2c34f5bcd4c6498e152b7fa49f41ce7cd7e1772adf44ec1d1f','2026-11-12 16:46:09.634','20261109131317_material_requests_notifications',NULL,NULL,'2026-11-12 16:46:08.934',1),('c7b9e565-4acc-4678-907c-d493c404a9af','fa92bd68c221a82dc320ee22287e4d5ec86aac09d64c08911ec75529c05ac827','2026-11-12 16:46:07.639','20261109071631_init_core_security_models',NULL,NULL,'2026-11-12 16:46:07.087',1),('ce702c0b-dffc-42f4-a3a7-2461d17f6788','8f642c9085c7a4c5f847be5db629dc640ba7f78065f023c55bfb0e6402f48b8a','2026-11-12 16:46:09.968','20261110044216_material_request_issue_timeline',NULL,NULL,'2026-11-12 16:46:09.634',1),('d7116ff9-4b03-4c6c-a988-b768cb05e6b3','c2c52dc44bad9869d3eedae142bcf60676a5fa1561bedf9dddc18867c9761fc8','2026-11-12 16:46:08.896','20261109094219_add_phase4_events_dishes',NULL,NULL,'2026-11-12 16:46:08.058',1),('dc647fc0-d6ea-454d-a209-6acf1d570af5','3e93cc1f2b3481f280f6eb4bbc4c34e17332cc7232e2e86ae4ea722c33c852b1','2026-11-12 16:46:08.934','20261109122905_event_material_is_draft',NULL,NULL,'2026-11-12 16:46:08.918',1),('dd0f4591-2c70-40af-a040-8dd6d6fa9957','4514a78e763656309d7452e71608d5956149d96ead6f4454216c2a9bcd0db7d0','2026-11-12 16:46:10.887','20261112110500_inventory_transaction_idempotency_key',NULL,NULL,'2026-11-12 16:46:10.858',1),('f5bdc340-8c38-44dc-aac3-7fe6acc3ea57','33910b50866c77b633079efae52c2b56c2f9ab36ebfd7ea8c17a8790e29ba070','2026-11-12 16:46:09.981','20261110044500_backfill_request_item_quantities',NULL,NULL,'2026-11-12 16:46:09.969',1);

INSERT INTO `User` VALUES ('21a34586-f0be-494c-a829-be19bdb597cd','Development','Admin','admin@foodinventory.local','$argon2id$v=19$m=19456,t=2,p=1$0PLtmdarVpJCyF07DVCURw$x5tZ+xjNZi6CX1tBEfMw2yvSKUGSri5Lv9zBImIwdtU','ADMIN',1,'2026-11-13 12:22:55.810','2026-11-12 16:46:26.190','2026-11-13 12:22:55.812',NULL),('43fdbfc6-9974-43a3-99cc-a3e68a5e6215','Development','Executor','executor@foodinventory.local','$argon2id$v=19$m=19456,t=2,p=1$jTR/B1X5b4Rc7E8EGHBb4A$npKIegpnAd/IyYJOPJYBNprF7lPuyumIqQyl+AByRks','EXECUTOR',1,NULL,'2026-11-12 16:46:26.277','2026-11-12 16:46:26.277',NULL);

INSERT INTO `Category` VALUES ('15509a39-6777-41a9-ab8f-2154e8675f36','Dry Fruits',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('37bab235-2a67-42a7-802d-be57ce1fccd8','Pulses',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('6b77f131-d8b6-4375-83f0-b07fdcb2b4e7','Flour',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('6e8408a6-ba08-45f4-b4e8-5bd91c2317fc','Dairy',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('8fcc63c0-430a-4a66-9327-b4b04a9790c3','Spices',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('a1aefa52-ddb1-4f96-8e44-67906532902d','Rice & Grains',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('e7024697-33cd-4da5-a6a7-5c23962d0405','Vegetables',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296'),('f067bd86-f44d-4214-9658-9fd75e408d0e','Oil & Ghee',NULL,1,'2026-11-12 16:46:26.296','2026-11-12 16:46:26.296');

INSERT INTO `Unit` VALUES ('1c79799f-1f78-488b-b25b-e408f6294396','Litre','L','VOLUME',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('23b00eb0-52a6-4a61-8de5-b4dbbd1c69e1','Gram','G','WEIGHT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('573edca8-5824-4640-98af-17d118d9f65e','Piece','PCS','COUNT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('6763ad79-657f-48ec-8f59-9b846f0c4102','Millilitre','ML','VOLUME',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('6c6939a8-b2df-47d0-929d-7321ec6c0da4','Box','BOX','COUNT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('a3c3fc30-1500-403d-a0fe-e3d960848ffa','Packet','PKT','COUNT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('e35bcd96-b07d-4a92-93ab-726d9b3c7bd1','Bag','BAG','COUNT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302'),('f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','Kilogram','KG','WEIGHT',1,'2026-11-12 16:46:26.302','2026-11-12 16:46:26.302');

INSERT INTO `FoodItem` VALUES ('0552993b-7f60-4c18-8f11-86cc91e08a55','Rice','Rice for kitchen use','a1aefa52-ddb1-4f96-8e44-67906532902d','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',20,50,1,'2026-11-12 16:46:26.312','2026-11-12 16:46:26.312'),('12102106-e9f3-40f2-b213-c132a0129687','Potato','Potato for kitchen use','e7024697-33cd-4da5-a6a7-5c23962d0405','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',15,40,1,'2026-11-12 16:46:26.369','2026-11-12 16:46:26.369'),('28775cba-f0b1-45fe-9551-bc29e0af0f46','Moong Dal','Moong Dal for kitchen use','37bab235-2a67-42a7-802d-be57ce1fccd8','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',15,30,1,'2026-11-12 16:46:26.339','2026-11-12 16:46:26.339'),('644be56f-9139-48ee-b921-c96406623099','Wheat Flour','Wheat Flour for kitchen use','6b77f131-d8b6-4375-83f0-b07fdcb2b4e7','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',10,30,1,'2026-11-12 16:46:26.323','2026-11-12 16:46:26.323'),('6b976a75-5816-4d09-82ae-0eed20a88882','Salt','Salt for kitchen use','8fcc63c0-430a-4a66-9327-b4b04a9790c3','a3c3fc30-1500-403d-a0fe-e3d960848ffa',10,20,1,'2026-11-12 16:46:26.384','2026-11-12 16:46:26.384'),('75888dce-cccb-43ce-8d37-b5494cd82e55','Cooking Oil','Cooking Oil for kitchen use','f067bd86-f44d-4214-9658-9fd75e408d0e','1c79799f-1f78-488b-b25b-e408f6294396',5,10,1,'2026-11-12 16:46:26.362','2026-11-12 16:46:26.362'),('898ffdc8-5f6a-4baa-8ac4-baf4e609fb96','Toor Dal','Toor Dal for kitchen use','37bab235-2a67-42a7-802d-be57ce1fccd8','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',15,30,1,'2026-11-12 16:46:26.329','2026-11-12 16:46:26.329'),('9e855fff-c38f-4790-9349-168e4611df11','Tomato','Tomato for kitchen use','e7024697-33cd-4da5-a6a7-5c23962d0405','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',15,30,1,'2026-11-12 16:46:26.377','2026-11-12 16:46:26.377'),('a1725907-bde4-4c9e-9fea-c1010f0936a1','Milk','Milk for kitchen use','6e8408a6-ba08-45f4-b4e8-5bd91c2317fc','1c79799f-1f78-488b-b25b-e408f6294396',10,20,1,'2026-11-12 16:46:26.355','2026-11-12 16:46:26.355'),('b3e425bf-a27f-4398-80b4-6be52209b01f','Sugar','Sugar for kitchen use','f067bd86-f44d-4214-9658-9fd75e408d0e','f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',10,30,1,'2026-11-12 16:46:26.346','2026-11-12 16:46:26.346');

INSERT INTO `Inventory` VALUES ('15638363-48cb-4ea1-9865-dd9c98b936aa','a1725907-bde4-4c9e-9fea-c1010f0936a1',100,'2026-11-12 16:46:26.359'),('264e2734-32eb-45fc-b378-3aefbce87b8d','75888dce-cccb-43ce-8d37-b5494cd82e55',100,'2026-11-12 16:46:26.365'),('46ef4672-891f-4121-9427-60b10c037682','28775cba-f0b1-45fe-9551-bc29e0af0f46',100,'2026-11-12 16:46:26.343'),('47673da4-6c5d-4368-ac52-f50d3785631a','6b976a75-5816-4d09-82ae-0eed20a88882',100,'2026-11-12 16:46:26.389'),('4e395d10-d615-4b0b-9936-e001dbcfcd2d','898ffdc8-5f6a-4baa-8ac4-baf4e609fb96',100,'2026-11-12 16:46:26.334'),('69962921-bf55-4fe7-b90e-eb6d30e5705f','9e855fff-c38f-4790-9349-168e4611df11',100,'2026-11-12 16:46:26.381'),('743d99bc-8802-4a8d-b72f-ce7c246f7565','0552993b-7f60-4c18-8f11-86cc91e08a55',100,'2026-11-12 16:46:26.318'),('a105039c-544a-49af-badb-1a560c758866','b3e425bf-a27f-4398-80b4-6be52209b01f',100,'2026-11-12 16:46:26.351'),('c90fc248-01d7-4f30-97ce-2aad0331d24b','644be56f-9139-48ee-b921-c96406623099',100,'2026-11-12 16:46:26.326'),('ea4751c9-f496-4f3f-9b3f-c4b5cbf54c28','12102106-e9f3-40f2-b213-c132a0129687',100,'2026-11-12 16:46:26.373');

INSERT INTO `Dish` VALUES ('0329ca99-0ee2-48af-b4c8-aa9a0015667b','Kheer','Kheer — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('387dd210-aa77-4f75-b5fb-28a53ad82a45','Dal','Dal — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('66d45f1c-330e-4c3d-9dd7-de3a8e6ebc1b','Rice','Rice — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('84983d69-66b8-46f1-8596-588288935526','Puri','Puri — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('9332632c-be9f-4710-ae60-7563be40a016','Halwa','Halwa — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('a77aa3c5-f549-47c2-baa0-79dd81753e8b','Sweet Rice','Sweet Rice — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('aefbce3a-c958-4859-be91-2e08a6418009','Sabji','Sabji — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394'),('de4af7ed-fd2c-4bca-88b3-2dd80e04624c','Khichdi','Khichdi — development sample dish',1,'2026-11-12 16:46:26.394','2026-11-12 16:46:26.394');

INSERT INTO `DishMaterial` VALUES ('1a5607fd-fdcf-4524-a28c-717619ec6a41','aefbce3a-c958-4859-be91-2e08a6418009','12102106-e9f3-40f2-b213-c132a0129687',0.080,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','2026-11-12 16:46:26.427','2026-11-12 16:46:26.427'),('4aa9f0f5-8a90-45f7-85d2-6df2fcdf2589','0329ca99-0ee2-48af-b4c8-aa9a0015667b','a1725907-bde4-4c9e-9fea-c1010f0936a1',0.200,'1c79799f-1f78-488b-b25b-e408f6294396','2026-11-12 16:46:26.412','2026-11-12 16:46:26.412'),('7a0caffd-c8be-445c-b1b7-be862db7cb7b','aefbce3a-c958-4859-be91-2e08a6418009','9e855fff-c38f-4790-9349-168e4611df11',0.020,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','2026-11-12 16:46:26.430','2026-11-12 16:46:26.430'),('963c2339-5e8e-4e4f-b0b4-ddf3589eb7f4','0329ca99-0ee2-48af-b4c8-aa9a0015667b','0552993b-7f60-4c18-8f11-86cc91e08a55',0.050,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','2026-11-12 16:46:26.408','2026-11-12 16:46:26.408'),('9eb09753-3879-4cd6-aafa-18fbe7aebf23','aefbce3a-c958-4859-be91-2e08a6418009','75888dce-cccb-43ce-8d37-b5494cd82e55',0.008,'1c79799f-1f78-488b-b25b-e408f6294396','2026-11-12 16:46:26.434','2026-11-12 16:46:26.434'),('cc7df6fe-e46c-4801-82c9-5862264a92a7','387dd210-aa77-4f75-b5fb-28a53ad82a45','75888dce-cccb-43ce-8d37-b5494cd82e55',0.010,'1c79799f-1f78-488b-b25b-e408f6294396','2026-11-12 16:46:26.424','2026-11-12 16:46:26.424'),('dc3d74ef-da1f-4eab-a261-426488a02807','387dd210-aa77-4f75-b5fb-28a53ad82a45','898ffdc8-5f6a-4baa-8ac4-baf4e609fb96',0.060,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','2026-11-12 16:46:26.421','2026-11-12 16:46:26.421'),('ecf40b9b-135b-466a-b970-5fda9e27d060','0329ca99-0ee2-48af-b4c8-aa9a0015667b','b3e425bf-a27f-4398-80b4-6be52209b01f',0.030,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7','2026-11-12 16:46:26.417','2026-11-12 16:46:26.417');

INSERT INTO `Event` VALUES ('a6ef5034-2276-4d1e-a656-1f00b5459425','EVT-2026-000001','Mahaprasadam','Development seed event — festival offering','2026-11-15','10:00','14:00',500,'Temple Kitchen','Development sample event','PLANNING','21a34586-f0be-494c-a829-be19bdb597cd','21a34586-f0be-494c-a829-be19bdb597cd','2026-11-12 16:46:26.439','2026-11-12 16:46:26.439',NULL,NULL,NULL);

INSERT INTO `EventCodeCounter` VALUES (2026,1);

INSERT INTO `EventDish` VALUES ('0b6c01ef-6c1e-4499-b647-848724a2ac17','a6ef5034-2276-4d1e-a656-1f00b5459425','0329ca99-0ee2-48af-b4c8-aa9a0015667b',1,NULL,'2026-11-12 16:46:26.448','2026-11-12 16:46:26.448'),('10b467c9-7a8d-4e41-a12d-763c6a2a1d0b','a6ef5034-2276-4d1e-a656-1f00b5459425','387dd210-aa77-4f75-b5fb-28a53ad82a45',2,NULL,'2026-11-12 16:46:26.452','2026-11-12 16:46:26.452'),('1739b364-4f5d-485c-9333-9a8c004fae0a','a6ef5034-2276-4d1e-a656-1f00b5459425','aefbce3a-c958-4859-be91-2e08a6418009',3,NULL,'2026-11-12 16:46:26.455','2026-11-12 16:46:26.455');

INSERT INTO `EventMaterial` VALUES ('0e03e445-c1ac-4033-a39d-71792b245e69','10b467c9-7a8d-4e41-a12d-763c6a2a1d0b','898ffdc8-5f6a-4baa-8ac4-baf4e609fb96',30.000,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',NULL,'2026-11-12 16:46:26.470','2026-11-12 16:46:26.470',0),('11edc623-ccdd-4c45-99f9-8aca70e0b530','1739b364-4f5d-485c-9333-9a8c004fae0a','12102106-e9f3-40f2-b213-c132a0129687',40.000,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',NULL,'2026-11-12 16:46:26.477','2026-11-12 16:46:26.477',0),('1e72a5d1-c2f0-4b59-809e-30016f46d153','0b6c01ef-6c1e-4499-b647-848724a2ac17','b3e425bf-a27f-4398-80b4-6be52209b01f',15.000,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',NULL,'2026-11-12 16:46:26.466','2026-11-12 16:46:26.466',0),('5303913a-2960-4826-bf87-c27060b5a6fe','1739b364-4f5d-485c-9333-9a8c004fae0a','9e855fff-c38f-4790-9349-168e4611df11',10.000,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',NULL,'2026-11-12 16:46:26.479','2026-11-12 16:46:26.479',0),('5ec817b9-77e9-4302-a836-ed025a78bec7','0b6c01ef-6c1e-4499-b647-848724a2ac17','0552993b-7f60-4c18-8f11-86cc91e08a55',25.000,'f60aa268-f6ed-4ef3-920d-e7c4985c5ee7',NULL,'2026-11-12 16:46:26.458','2026-11-12 16:46:26.458',0),('93313004-f115-4872-82d4-3447f81751c0','1739b364-4f5d-485c-9333-9a8c004fae0a','75888dce-cccb-43ce-8d37-b5494cd82e55',4.000,'1c79799f-1f78-488b-b25b-e408f6294396',NULL,'2026-11-12 16:46:26.483','2026-11-12 16:46:26.483',0),('bca8b3bb-6000-43bb-8397-91ad6fd7bdb1','0b6c01ef-6c1e-4499-b647-848724a2ac17','a1725907-bde4-4c9e-9fea-c1010f0936a1',100.000,'1c79799f-1f78-488b-b25b-e408f6294396',NULL,'2026-11-12 16:46:26.462','2026-11-12 16:46:26.462',0),('fcae4058-05c3-4940-9cb9-c9fa41c82430','10b467c9-7a8d-4e41-a12d-763c6a2a1d0b','75888dce-cccb-43ce-8d37-b5494cd82e55',5.000,'1c79799f-1f78-488b-b25b-e408f6294396',NULL,'2026-11-12 16:46:26.473','2026-11-12 16:46:26.473',0);

INSERT INTO `AdminExecutorAssignment` VALUES ('411e9d5d-19b8-4bd4-b804-dcd697828b7a','21a34586-f0be-494c-a829-be19bdb597cd','43fdbfc6-9974-43a3-99cc-a3e68a5e6215','2026-11-12 16:46:26.290',NULL,1,'2026-11-12 16:46:26.290','2026-11-12 16:46:26.290');

SET FOREIGN_KEY_CHECKS = 1;
