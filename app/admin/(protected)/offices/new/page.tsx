import { OfficeForm } from "@/components/admin/OfficeForm";
import { createOffice } from "../actions";

export default function NewOfficePage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Add office</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <OfficeForm action={createOffice} />
      </div>
    </div>
  );
}
