import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OfficeForm } from "@/components/admin/OfficeForm";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  updateOffice,
  addDivision,
  deleteDivision,
  addCity,
  deleteCity,
  addDeliveryZone,
  deleteDeliveryZone,
} from "../actions";

export default async function OfficeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const office = await prisma.office.findUnique({
    where: { id },
    include: {
      divisions: { include: { cities: true }, orderBy: { sortOrder: "asc" } },
      deliveryZones: { include: { division: true, city: true } },
    },
  });
  if (!office) notFound();

  const updateOfficeWithId = updateOffice.bind(null, office.id);
  const addDivisionWithId = addDivision.bind(null, office.id);
  const addCityWithId = addCity.bind(null, office.id);
  const addZoneWithId = addDeliveryZone.bind(null, office.id);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">{office.name}</h1>

      <Card>
        <CardHeader className="font-medium">Office configuration</CardHeader>
        <CardBody>
          <OfficeForm action={updateOfficeWithId} office={office} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">
          {office.divisionLabel}s ({office.divisions.length})
        </CardHeader>
        <CardBody className="space-y-4">
          <ul className="divide-y divide-zinc-100">
            {office.divisions.map((division) => (
              <li key={division.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-800">{division.name}</span>
                  <form action={deleteDivision.bind(null, office.id, division.id)}>
                    <button className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {division.cities.map((city) => (
                    <span key={city.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      {city.name}
                      <form action={deleteCity.bind(null, office.id, city.id)}>
                        <button className="text-zinc-400 hover:text-red-600">×</button>
                      </form>
                    </span>
                  ))}
                </div>
                <form action={addCityWithId} className="mt-2 flex gap-2">
                  <input type="hidden" name="divisionId" value={division.id} />
                  <Input name="name" placeholder={`Add city in ${division.name}`} className="max-w-xs py-1.5 text-sm" required />
                  <Button size="sm" variant="secondary" type="submit">
                    Add city
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addDivisionWithId} className="flex gap-2 border-t border-zinc-100 pt-4">
            <Input name="name" placeholder={`New ${office.divisionLabel.toLowerCase()} name`} required />
            <Button type="submit" size="sm">
              Add {office.divisionLabel.toLowerCase()}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Delivery zones & charges</CardHeader>
        <CardBody className="space-y-4">
          <ul className="divide-y divide-zinc-100 text-sm">
            {office.deliveryZones.map((zone) => (
              <li key={zone.id} className="flex items-center justify-between py-2">
                <span>
                  <strong>{zone.name}</strong>
                  {zone.division ? ` · ${zone.division.name}` : ""}
                  {zone.city ? ` · ${zone.city.name}` : ""} —{" "}
                  {zone.isFree ? "Free" : `${office.currencySymbol}${zone.fee}`}
                  {zone.estimatedDays ? ` · ${zone.estimatedDays}` : ""}
                </span>
                <form action={deleteDeliveryZone.bind(null, office.id, zone.id)}>
                  <button className="text-xs text-red-600 hover:underline">Remove</button>
                </form>
              </li>
            ))}
            {office.deliveryZones.length === 0 && <p className="py-2 text-zinc-500">No custom zones — the office default fee applies everywhere.</p>}
          </ul>
          <form action={addZoneWithId} className="grid gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-2">
            <Input name="name" placeholder="Zone name (e.g. Lagos)" required />
            <Select name="divisionId" defaultValue="">
              <option value="">Any {office.divisionLabel.toLowerCase()}</option>
              {office.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Input name="fee" type="number" step="0.01" min={0} placeholder="Fee" />
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="isFree" className="h-4 w-4 rounded border-zinc-300" /> Free delivery
            </label>
            <Input name="estimatedDays" placeholder="Estimated delivery time (e.g. 1-2 days)" />
            <Button type="submit" size="sm" className="sm:col-span-2">
              Add delivery zone
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
