import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PageHeader, Card, Button, Input } from '@/components/ui';
import { OfficeForm } from '../office-form';
import { updateOffice, createDivision, deleteDivision, createCity, deleteCity, createDeliveryArea, deleteDeliveryArea } from '../actions';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function OfficeDetailPage({ params }: { params: { id: string } }) {
  await requirePageAccess('offices');
  const office = await db.office.findUnique({
    where: { id: params.id },
    include: { divisions: { orderBy: { name: 'asc' }, include: { cities: { orderBy: { name: 'asc' }, include: { deliveryAreas: { orderBy: { name: 'asc' } } } } } } },
  });
  if (!office) notFound();

  const updateOfficeBound = updateOffice.bind(null, office.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader title={`${office.name} configuration`} description="Currency, phone rules, delivery and tax settings for this office." />
        <Card>
          <OfficeForm office={office} action={updateOfficeBound} />
        </Card>
      </div>

      <div>
        <PageHeader
          title="Locations"
          description={`${office.divisionLabel} → City/Town → Delivery Area. Used by the COD form and delivery fee lookup.`}
        />
        <Card>
          <form action={createDivision.bind(null, office.id)} className="mb-4 flex gap-2">
            <Input name="name" placeholder={`New ${office.divisionLabel.toLowerCase()} name`} required />
            <Button type="submit">Add {office.divisionLabel}</Button>
          </form>

          <div className="flex flex-col gap-4">
            {office.divisions.map((division) => (
              <div key={division.id} className="rounded-lg border border-brand-dark/10 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium text-brand-dark">{division.name}</p>
                  <form action={deleteDivision.bind(null, office.id, division.id)}>
                    <button className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                </div>

                <form action={createCity.bind(null, office.id, division.id)} className="mb-3 flex gap-2">
                  <Input name="name" placeholder="Add city/town" required className="max-w-xs" />
                  <Button type="submit" variant="secondary">Add City</Button>
                </form>

                <div className="ml-4 flex flex-col gap-3">
                  {division.cities.map((city) => (
                    <div key={city.id} className="rounded-md bg-brand-dark/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-brand-dark">{city.name}</p>
                        <form action={deleteCity.bind(null, office.id, city.id)}>
                          <button className="text-xs text-red-600 hover:underline">Remove</button>
                        </form>
                      </div>
                      <form action={createDeliveryArea.bind(null, office.id, city.id, '', '')} className="hidden" />
                      <DeliveryAreaForm officeId={office.id} cityId={city.id} />
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {city.deliveryAreas.map((area) => (
                          <li key={area.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-brand-dark shadow-sm">
                            {area.name} {area.fee != null ? `· ${Number(area.fee)}` : ''}
                            <form action={deleteDeliveryArea.bind(null, office.id, area.id)}>
                              <button className="text-red-500">×</button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DeliveryAreaForm({ officeId, cityId }: { officeId: string; cityId: string }) {
  async function action(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '');
    const fee = String(formData.get('fee') ?? '');
    await createDeliveryArea(officeId, cityId, name, fee || undefined);
  }
  return (
    <form action={action} className="flex gap-2">
      <Input name="name" placeholder="Delivery area (optional)" className="max-w-[10rem]" />
      <Input name="fee" placeholder="Fee override" type="number" step="0.01" className="max-w-[7rem]" />
      <Button type="submit" variant="secondary">Add</Button>
    </form>
  );
}
