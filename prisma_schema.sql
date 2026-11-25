-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'EXECUTOR', 'EVENT_CREATOR') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `avatarUrl` MEDIUMTEXT NULL,
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
    `currentQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Inventory_foodItemId_key`(`foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryTransaction` (
    `id` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `transactionType` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `balanceBefore` DECIMAL(12, 3) NOT NULL,
    `balanceAfter` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 2) NULL,
    `totalCost` DECIMAL(14, 2) NULL,
    `stockLotId` CHAR(36) NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `performedBy` VARCHAR(191) NULL,
    `vendorId` CHAR(36) NULL,
    `remarks` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InventoryTransaction_idempotencyKey_key`(`idempotencyKey`),
    INDEX `InventoryTransaction_foodItemId_idx`(`foodItemId`),
    INDEX `InventoryTransaction_transactionType_idx`(`transactionType`),
    INDEX `InventoryTransaction_vendorId_idx`(`vendorId`),
    INDEX `InventoryTransaction_createdAt_idx`(`createdAt`),
    INDEX `InventoryTransaction_stockLotId_idx`(`stockLotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLotCodeCounter` (
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLot` (
    `id` CHAR(36) NOT NULL,
    `lotNumber` VARCHAR(50) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `vendorId` CHAR(36) NULL,
    `stockType` ENUM('CHARITY', 'EXPENSE') NULL,
    `donorName` VARCHAR(200) NULL,
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
    INDEX `StockLot_stockType_idx`(`stockType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `Event` (
    `id` CHAR(36) NOT NULL,
    `eventCode` VARCHAR(30) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `eventDate` DATE NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `numberOfPeople` INTEGER NOT NULL,
    `location` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `donationAmount` DECIMAL(12, 2) NULL,
    `donationGivenBy` VARCHAR(200) NULL,
    `trNumber` VARCHAR(50) NULL,
    `donationType` VARCHAR(20) NULL,
    `eventType` VARCHAR(50) NULL,
    `servingType` VARCHAR(20) NULL,
    `contactPerson` VARCHAR(100) NULL,
    `mobileNumber` VARCHAR(30) NULL,
    `status` ENUM('DRAFT', 'PLANNING', 'READY', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `cancellationReason` TEXT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledById` CHAR(36) NULL,
    `dispatchDestination` VARCHAR(500) NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `dispatchedById` CHAR(36) NULL,
    `verifiedById` CHAR(36) NULL,
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
CREATE TABLE `EventExpense` (
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

    INDEX `EventExpense_eventId_idx`(`eventId`),
    INDEX `EventExpense_category_idx`(`category`),
    INDEX `EventExpense_expenseDate_idx`(`expenseDate`),
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
    `quantity` DECIMAL(12, 3) NULL,
    `quantityUnit` VARCHAR(20) NULL,
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
    `isDraft` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventMaterial_eventDishId_idx`(`eventDishId`),
    UNIQUE INDEX `EventMaterial_eventDishId_foodItemId_key`(`eventDishId`, `foodItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED', 'CANCELLED_BY_EVENT') NOT NULL DEFAULT 'DRAFT',
    `requestType` ENUM('INITIAL', 'ADDITIONAL') NOT NULL DEFAULT 'INITIAL',
    `parentRequestId` CHAR(36) NULL,
    `reason` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `issuedAt` DATETIME(3) NULL,
    `approverId` CHAR(36) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialRequest_requestCode_key`(`requestCode`),
    INDEX `MaterialRequest_eventId_idx`(`eventId`),
    INDEX `MaterialRequest_requestedById_idx`(`requestedById`),
    INDEX `MaterialRequest_adminId_idx`(`adminId`),
    INDEX `MaterialRequest_status_idx`(`status`),
    INDEX `MaterialRequest_requestType_idx`(`requestType`),
    INDEX `MaterialRequest_parentRequestId_idx`(`parentRequestId`),
    INDEX `MaterialRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialRequestItem` (
    `id` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `foodItemId` CHAR(36) NOT NULL,
    `dishId` CHAR(36) NULL,
    `plannedQuantity` DECIMAL(12, 3) NOT NULL,
    `requestedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `approvedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `issuedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `rejectedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `unitId` CHAR(36) NOT NULL,
    `sourceEventMaterialId` CHAR(36) NULL,
    `remarks` TEXT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED', 'CANCELLED_BY_EVENT') NOT NULL DEFAULT 'REQUESTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaterialRequestItem_requestId_idx`(`requestId`),
    INDEX `MaterialRequestItem_foodItemId_idx`(`foodItemId`),
    INDEX `MaterialRequestItem_dishId_idx`(`dishId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `category` VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    `priority` VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `referenceType` VARCHAR(50) NULL,
    `referenceId` CHAR(36) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Notification_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminExecutorAssignment` ADD CONSTRAINT `AdminExecutorAssignment_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminExecutorAssignment` ADD CONSTRAINT `AdminExecutorAssignment_executorId_fkey` FOREIGN KEY (`executorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FoodItem` ADD CONSTRAINT `FoodItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FoodItem` ADD CONSTRAINT `FoodItem_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryTransaction` ADD CONSTRAINT `InventoryTransaction_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventExpense` ADD CONSTRAINT `EventExpense_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventExpense` ADD CONSTRAINT `EventExpense_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLot` ADD CONSTRAINT `StockLot_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `StockLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockAllocation` ADD CONSTRAINT `StockAllocation_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_parentRequestId_fkey` FOREIGN KEY (`parentRequestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_foodItemId_fkey` FOREIGN KEY (`foodItemId`) REFERENCES `FoodItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_dishId_fkey` FOREIGN KEY (`dishId`) REFERENCES `Dish`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_sourceEventMaterialId_fkey` FOREIGN KEY (`sourceEventMaterialId`) REFERENCES `EventMaterial`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestTimeline` ADD CONSTRAINT `MaterialRequestTimeline_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestTimeline` ADD CONSTRAINT `MaterialRequestTimeline_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

