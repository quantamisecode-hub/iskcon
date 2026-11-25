-- Donor attribution for CHARITY stock. NULL for EXPENSE and legacy lots.
ALTER TABLE `StockLot`
    ADD COLUMN `donorName` VARCHAR(200) NULL;
