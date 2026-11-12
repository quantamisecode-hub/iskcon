/** One-off QA readout: verifies Phase 7 stock/ledger/status/timeline after the live E2E run. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();

  const food = await p.foodItem.findFirst({
    where: { name: { contains: 'Cooking Oil' } },
    include: { inventory: true },
  });
  const ledger = await p.inventoryTransaction.findMany({
    where: { referenceType: 'MATERIAL_REQUEST_ISSUE' },
    orderBy: { createdAt: 'asc' },
  });
  const req = await p.materialRequest.findFirst({
    where: { requestCode: 'REQ-2026-000004' },
    include: { items: true, timeline: { orderBy: { createdAt: 'asc' } } },
  });

  const notes = await p.notification.findMany({
    where: { referenceId: req?.id ?? '' },
    select: { type: true, userId: true },
  });

  console.log(
    JSON.stringify(
      {
        cookingOilStock: food?.inventory?.currentQuantity ?? null,
        ledger: ledger.map((x) => ({
          qty: x.quantity,
          balanceAfter: x.balanceAfter,
          type: x.transactionType,
          ref: x.referenceType,
        })),
        status: req?.status,
        items: req?.items.map((i) => ({
          requested: i.requestedQuantity,
          approved: i.approvedQuantity,
          issued: i.issuedQuantity,
          pending: i.pendingQuantity,
          itemStatus: i.itemStatus,
        })),
        timeline: req?.timeline.map((t) => t.action),
        notifications: notes.map((n) => n.type),
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
