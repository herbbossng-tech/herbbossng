import type { Order, Office, Product, Offer, Customer } from '@prisma/client';
import { formatMoney } from '@/lib/currency';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';

type OrderWithRelations = Order & { office: Office; product: Product; offer: Offer; customer: Customer };

export function buildOrderEmailVariables(order: OrderWithRelations): Record<string, string> {
  return {
    customer_name: order.customerName,
    order_number: order.orderNumber,
    product_name: order.product.name,
    package_name: order.offer.name,
    quantity: String(order.quantityPaid + order.quantityFree),
    subtotal: formatMoney(order.subtotal, order.office),
    shipping: Number(order.shipping) === 0 ? 'Free' : formatMoney(order.shipping, order.office),
    total: formatMoney(order.total, order.office),
    currency: order.currencyCode,
    delivery_address: order.deliveryAddress,
    city: order.cityName,
    state: order.divisionName,
    office_name: order.office.name,
    office_phone: order.office.officePhone ?? '',
    order_date: order.createdAt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
    order_status: ORDER_STATUS_LABELS[order.status],
    phone: order.phone,
    email: order.email ?? '',
  };
}
