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
