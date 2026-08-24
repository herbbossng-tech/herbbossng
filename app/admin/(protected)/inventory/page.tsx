import { prisma } from "@/lib/prisma";
import { getCurrentAdminOffice } from "@/lib/office-context";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { adjustInventory } from "./actions";

export default async function InventoryPage() {
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const rows = await prisma.productOffice.findMany({
    where: { officeId: office.id },
    include: { product: true, inventory: { include: { movements: { orderBy: { createdAt: "desc" }, take: 5 } } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Inventory — {office.name}</h1>
        <p className="text-sm text-zinc-500">Deduction strategy: {office.inventoryStrategy.replace(/_/g, " ").toLowerCase()}</p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const onHand = row.inventory?.quantityOnHand ?? 0;
          const reserved = row.inventory?.quantityReserved ?? 0;
          const available = onHand - reserved;
          const low = available <= row.lowStockThreshold;
          return (
            <Card key={row.id}>
              <CardHeader className="flex items-center justify-between">
                <span className="font-medium">{row.product.name}</span>
                <div className="flex items-center gap-2">
                  {low && <Badge tone="red">Low stock</Badge>}
                  <Badge tone="gray">On hand: {onHand}</Badge>
                  <Badge tone="gold">Reserved: {reserved}</Badge>
                  <Badge tone="green">Available: {available}</Badge>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {row.inventory && (
                  <form action={adjustInventory} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="productOfficeId" value={row.id} />
                    <div>
                      <Label>Type</Label>
                      <Select name="type" defaultValue="STOCK_ADDITION">
                        <option value="STOCK_ADDITION">Stock addition</option>
                        <option value="PURCHASE">Purchase</option>
                        <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
                        <option value="RETURN">Return</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="OTHER">Other</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Quantity (use negative to remove)</Label>
                      <Input name="quantity" type="number" required className="w-32" />
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <Label>Reason</Label>
                      <Input name="reason" placeholder="e.g. New shipment received" />
                    </div>
                    <Button type="submit" size="sm">
                      Apply
                    </Button>
                  </form>
                )}
                {row.inventory && row.inventory.movements.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Recent movements</p>
                    <ul className="space-y-1 text-xs text-zinc-600">
                      {row.inventory.movements.map((m) => (
                        <li key={m.id} className="flex justify-between">
                          <span>
                            {m.type.replace(/_/g, " ")} {m.reason ? `— ${m.reason}` : ""}
                          </span>
                          <span className={m.quantity < 0 ? "text-red-600" : "text-brand-green-700"}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity} · {m.createdAt.toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-zinc-500">No products priced for this office yet.</p>}
      </div>
    </div>
  );
}
