import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SECTION_FIELD_CONFIG, contentToFormValues } from "@/lib/section-content";
import type { SectionType } from "@/app/generated/prisma/enums";

export function SectionEditorForm({
  type,
  content,
  action,
}: {
  type: SectionType;
  content: Record<string, unknown>;
  action: (formData: FormData) => Promise<void>;
}) {
  const fields = SECTION_FIELD_CONFIG[type];
  const values = contentToFormValues(type, content);

  return (
    <form action={action} className="space-y-3">
      {fields.map((field) =>
        field.multiline ? (
          <div key={field.name}>
            <Label htmlFor={field.name}>{field.label}</Label>
            <Textarea id={field.name} name={field.name} rows={field.name === "html" ? 8 : 4} defaultValue={values[field.name] ?? ""} />
          </div>
        ) : (
          <div key={field.name}>
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input id={field.name} name={field.name} defaultValue={values[field.name] ?? ""} />
          </div>
        ),
      )}
      <Button type="submit" size="sm">
        Save section
      </Button>
    </form>
  );
}
