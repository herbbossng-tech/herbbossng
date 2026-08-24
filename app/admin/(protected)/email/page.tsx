import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { EmailTemplateKey } from "@/app/generated/prisma/enums";

const TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  NEW_ORDER_ADMIN: "New order (to your team)",
  ORDER_CONFIRMATION_CUSTOMER: "Order confirmation (to customer)",
  ORDER_CONFIRMED: "Order confirmed",
  ORDER_DISPATCHED: "Order dispatched",
  ORDER_OUT_FOR_DELIVERY: "Out for delivery",
  ORDER_DELIVERED: "Delivered",
  ORDER_CANCELLED: "Cancelled",
  ORDER_FAILED_DELIVERY: "Failed delivery",
};

export default async function EmailTemplatesPage() {
  const templates = await prisma.emailTemplate.findMany();
  const byKey = new Map(templates.map((t) => [t.key, t]));

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Email templates</h1>
      <div className="grid gap-3">
        {Object.entries(TEMPLATE_LABELS).map(([key, label]) => {
          const template = byKey.get(key as EmailTemplateKey);
          return (
            <Link key={key} href={`/admin/email/${key}`}>
              <Card className="hover:shadow-md">
                <CardBody className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900">{label}</span>
                  <Badge tone={template?.isActive ? "green" : "gray"}>{template ? (template.isActive ? "Active" : "Inactive") : "Not configured"}</Badge>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
