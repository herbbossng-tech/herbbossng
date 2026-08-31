import { PageHeader, Card } from '@/components/ui';
import { OfficeForm } from '../office-form';
import { createOffice } from '../actions';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function NewOfficePage() {
  await requirePageAccess('offices');
  return (
    <div>
      <PageHeader title="Add Office" description="Add a new country market. No code changes required." />
      <Card>
        <OfficeForm action={createOffice} />
      </Card>
    </div>
  );
}
