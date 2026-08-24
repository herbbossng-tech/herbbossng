import { prisma } from "@/lib/prisma";
import { subDays, startOfDay } from "date-fns";

export type DashboardStats = {
  totalOrders: number;
  newOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  dispatchedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  failedDeliveryOrders: number;
  revenue: number;
  codCollected: number;
  outstandingCod: number;
  inventoryValue: number;
};

export async function getDashboardStats(officeId: string, sinceDays = 30): Promise<DashboardStats> {
  const since = startOfDay(subDays(new Date(), sinceDays));

  const [orders, inventoryRows] = await Promise.all([
    prisma.order.findMany({
      where: { officeId, createdAt: { gte: since } },
      select: { status: true, paymentStatus: true, total: true },
    }),
    prisma.productOffice.findMany({
      where: { officeId },
      select: { costPrice: true, inventory: { select: { quantityOnHand: true } } },
    }),
  ]);

  const stats: DashboardStats = {
    totalOrders: orders.length,
    newOrders: 0,
    pendingOrders: 0,
    confirmedOrders: 0,
    dispatchedOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    failedDeliveryOrders: 0,
    revenue: 0,
    codCollected: 0,
    outstandingCod: 0,
    inventoryValue: 0,
  };

  for (const order of orders) {
    const total = Number(order.total);
    if (order.status !== "CANCELLED") stats.revenue += total;
    if (order.status === "NEW") stats.newOrders += 1;
    if (order.status === "PENDING_CONFIRMATION") stats.pendingOrders += 1;
    if (order.status === "CONFIRMED") stats.confirmedOrders += 1;
    if (order.status === "DISPATCHED" || order.status === "OUT_FOR_DELIVERY") stats.dispatchedOrders += 1;
    if (order.status === "DELIVERED") stats.deliveredOrders += 1;
    if (order.status === "CANCELLED") stats.cancelledOrders += 1;
    if (order.status === "FAILED_DELIVERY") stats.failedDeliveryOrders += 1;

    if (order.paymentStatus === "COD_COLLECTED") stats.codCollected += total;
    if (order.paymentStatus === "COD_PENDING" && order.status !== "CANCELLED") stats.outstandingCod += total;
  }

  for (const row of inventoryRows) {
    const qty = row.inventory?.quantityOnHand ?? 0;
    stats.inventoryValue += qty * Number(row.costPrice);
  }

  return stats;
}

export async function getOrdersOverTime(officeId: string, days = 14) {
  const since = startOfDay(subDays(new Date(), days));
  const orders = await prisma.order.findMany({
    where: { officeId, createdAt: { gte: since } },
    select: { createdAt: true, total: true, status: true },
  });

  const buckets = new Map<string, { date: string; orders: number; revenue: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(subDays(new Date(), i));
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, orders: 0, revenue: 0 });
  }
  for (const order of orders) {
    const key = startOfDay(order.createdAt).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.orders += 1;
      if (order.status !== "CANCELLED") bucket.revenue += Number(order.total);
    }
  }
  return Array.from(buckets.values());
}
