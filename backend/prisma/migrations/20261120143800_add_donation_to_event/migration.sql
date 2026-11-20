-- Add donation fields to Event model
ALTER TABLE `Event` ADD COLUMN `donationAmount` DECIMAL(12, 2) NULL;
ALTER TABLE `Event` ADD COLUMN `donationGivenBy` VARCHAR(200) NULL;
