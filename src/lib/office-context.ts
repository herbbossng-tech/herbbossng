import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { OFFICE_COOKIE } from '@/lib/office-cookie';

export { OFFICE_COOKIE };

/** Resolves the admin's "current office" — cookie first, else the first active office. */
export async function getActiveOffice() {
  const cookieStore = cookies();
  const officeId = cookieStore.get(OFFICE_COOKIE)?.value;

  if (officeId) {
    const office = await db.office.findUnique({ where: { id: officeId } });
    if (office) return office;
  }

  return db.office.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
}

export async function listOffices() {
  return db.office.findMany({ orderBy: { sortOrder: 'asc' } });
}
