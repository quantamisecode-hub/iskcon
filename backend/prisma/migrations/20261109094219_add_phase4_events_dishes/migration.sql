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
