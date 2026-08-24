import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SectionEditorForm } from "@/components/admin/SectionEditorForm";
import {
  updateLandingPageMeta,
  setLandingPageStatus,
  duplicateLandingPage,
  addSection,
  updateSectionContent,
  toggleSection,
  deleteSection,
  moveSection,
} from "../actions";

const SECTION_TYPES = [
  "ANNOUNCEMENT_BAR", "HERO", "TRUST_BADGES", "PROBLEM", "FORMULA", "HOW_IT_WORKS",
  "BENEFITS", "COMPARISON", "GUARANTEE", "TESTIMONIALS", "FAQ", "ORDER", "FOOTER", "CUSTOM_HTML",
] as const;

export default async function LandingPageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [page, products, offices] = await Promise.all([
    prisma.landingPage.findUnique({ where: { id }, include: { sections: { orderBy: { sortOrder: "asc" } } } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.office.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!page) notFound();

  const updateMetaWithId = updateLandingPageMeta.bind(null, page.id);
  const addSectionWithId = addSection.bind(null, page.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{page.title}</h1>
          <p className="text-sm text-zinc-500">/{page.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={page.status === "PUBLISHED" ? "green" : "gray"}>{page.status}</Badge>
          {page.status !== "PUBLISHED" ? (
            <form action={setLandingPageStatus.bind(null, page.id, "PUBLISHED")}>
              <Button size="sm" variant="gold" type="submit">
                Publish
              </Button>
            </form>
          ) : (
            <form action={setLandingPageStatus.bind(null, page.id, "DRAFT")}>
              <Button size="sm" variant="secondary" type="submit">
                Unpublish
              </Button>
            </form>
          )}
          <form action={duplicateLandingPage.bind(null, page.id)}>
            <Button size="sm" variant="secondary" type="submit">
              Duplicate
            </Button>
          </form>
          {page.status === "PUBLISHED" && (
            <a href={`/${page.slug}`} target="_blank" className="text-sm text-brand-green-700 hover:underline">
              View live →
            </a>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="font-medium">Page settings</CardHeader>
        <CardBody>
          <form action={updateMetaWithId} className="space-y-4">
            <div>
              <Label htmlFor="productId">Product</Label>
              <Select id="productId" name="productId" defaultValue={page.productId} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="officeId">Default office</Label>
              <Select id="officeId" name="officeId" defaultValue={page.officeId ?? ""}>
                <option value="">No default</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Internal title</Label>
              <Input id="title" name="title" defaultValue={page.title} required />
            </div>
            <div>
              <Label htmlFor="slug">URL slug</Label>
              <Input id="slug" name="slug" defaultValue={page.slug} required />
            </div>
            <div>
              <Label htmlFor="stickyCtaText">Sticky mobile CTA text</Label>
              <Input id="stickyCtaText" name="stickyCtaText" defaultValue={page.stickyCtaText ?? ""} placeholder="ORDER FROM {price} • PAY ON DELIVERY" />
            </div>
            <div>
              <Label htmlFor="seoTitle">SEO title</Label>
              <Input id="seoTitle" name="seoTitle" defaultValue={page.seoTitle ?? ""} />
            </div>
            <div>
              <Label htmlFor="seoDescription">SEO description</Label>
              <Input id="seoDescription" name="seoDescription" defaultValue={page.seoDescription ?? ""} />
            </div>
            <Button type="submit" size="sm">
              Save settings
            </Button>
          </form>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Sections</h2>
        <div className="space-y-3">
          {page.sections.map((section, index) => (
            <Card key={section.id}>
              <CardHeader className="flex items-center justify-between">
                <span className="font-medium">
                  {index + 1}. {section.type.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <form action={moveSection.bind(null, page.id, section.id, "up")}>
                    <button className="text-zinc-500 hover:underline" disabled={index === 0}>
                      ↑
                    </button>
                  </form>
                  <form action={moveSection.bind(null, page.id, section.id, "down")}>
                    <button className="text-zinc-500 hover:underline" disabled={index === page.sections.length - 1}>
                      ↓
                    </button>
                  </form>
                  <form action={toggleSection.bind(null, page.id, section.id, !section.isEnabled)}>
                    <button className="text-zinc-500 hover:underline">{section.isEnabled ? "Disable" : "Enable"}</button>
                  </form>
                  <form action={deleteSection.bind(null, page.id, section.id)}>
                    <button className="text-red-600 hover:underline">Delete</button>
                  </form>
                </div>
              </CardHeader>
              <CardBody>
                <SectionEditorForm
                  type={section.type}
                  content={(section.content as Record<string, unknown>) ?? {}}
                  action={updateSectionContent.bind(null, page.id, section.id, section.type)}
                />
              </CardBody>
            </Card>
          ))}
        </div>

        <form action={addSectionWithId} className="mt-4 flex gap-2">
          <Select name="type" defaultValue="BENEFITS">
            {SECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            + Add section
          </Button>
        </form>
      </div>
    </div>
  );
}
