-- New least-privilege role: create and view own events only.
-- Adding an ENUM label is metadata-only in MySQL; no data backfill is needed.
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'EXECUTOR', 'EVENT_CREATOR') NOT NULL;
