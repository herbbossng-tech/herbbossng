import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveEmailTemplate } from "../actions";
import type { EmailTemplateKey } from "@/app/generated/prisma/enums";

const VALID_KEYS: EmailTemplateKey[] = [
  "NEW_ORDER_ADMIN", "ORDER_CONFIRMATION_CUSTOMER", "ORDER_CONFIRMED", "ORDER_DISPATCHED",
  "ORDER_OUT_FOR_DELIVERY", "ORDER_DELIVERED", "ORDER_CANCELLED", "ORDER_FAILED_DELIVERY",
];

const AVAILABLE_VARIABLES = [
  "{{customer_name}}", "{{order_number}}", "{{customer_phone}}", "{{customer_email}}",
  "{{delivery_address}}", "{{city}}", "{{state}}", "{{office_name}}", "{{office_phone}}",
  "{{order_date}}", "{{order_status}}", "{{currency}}", "{{subtotal}}", "{{shipping}}", "{{total}}",
  "{{order_info_rows}}", "{{order_summary_rows}}",
];

export default async function EmailTemplateEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!VALID_KEYS.includes(key as EmailTemplateKey)) notFound();
  const typedKey = key as EmailTemplateKey;

  const template = await prisma.emailTemplate.findUnique({ where: { key: typedKey } });
  const saveWithKey = saveEmailTemplate.bind(null, typedKey);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">{key.replace(/_/g, " ")}</h1>
      <Card>
        <CardBody className="space-y-4">
          <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">
            Available variables: {AVAILABLE_VARIABLES.map((v) => (
              <code key={v} className="mx-0.5 rounded bg-white px-1 py-0.5">
                {v}
              </code>
            ))}
            <br />
            Tip: drop <code className="rounded bg-white px-1 py-0.5">{"{{order_info_rows}}"}</code> or{" "}
            <code className="rounded bg-white px-1 py-0.5">{"{{order_summary_rows}}"}</code> into the body for a
            ready-made label/value table.
          </div>
          <form action={saveWithKey} className="space-y-4">
            <div>
              <Label htmlFor="name">Internal name</Label>
              <Input id="name" name="name" required defaultValue={template?.name ?? key.replace(/_/g, " ")} />
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" required defaultValue={template?.subject ?? ""} placeholder="New order {{order_number}} received" />
            </div>
            <div>
              <Label htmlFor="previewText">Preview text</Label>
              <Input id="previewText" name="previewText" defaultValue={template?.previewText ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="brandName">Brand name</Label>
                <Input id="brandName" name="brandName" required defaultValue={template?.brandName ?? "Wellness247"} />
              </div>
              <div>
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input id="logoUrl" name="logoUrl" defaultValue={template?.logoUrl ?? ""} />
              </div>
              <div>
                <Label htmlFor="headerColor">Header color</Label>
                <Input id="headerColor" name="headerColor" type="text" required defaultValue={template?.headerColor ?? "#0f3d2e"} />
              </div>
              <div>
                <Label htmlFor="accentColor">Accent color</Label>
                <Input id="accentColor" name="accentColor" type="text" required defaultValue={template?.accentColor ?? "#c9a24b"} />
              </div>
            </div>
            <div>
              <Label htmlFor="bodyHtml">Body (HTML with variables)</Label>
              <Textarea id="bodyHtml" name="bodyHtml" rows={10} required defaultValue={template?.bodyHtml ?? ""} className="font-mono text-xs" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="buttonText">Button text (optional)</Label>
                <Input id="buttonText" name="buttonText" defaultValue={template?.buttonText ?? ""} />
              </div>
              <div>
                <Label htmlFor="buttonUrl">Button URL (optional)</Label>
                <Input id="buttonUrl" name="buttonUrl" defaultValue={template?.buttonUrl ?? ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="footerText">Footer text</Label>
              <Input id="footerText" name="footerText" defaultValue={template?.footerText ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="isActive" defaultChecked={template?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
              Active — send this email
            </label>
            <Button type="submit">Save template</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
