import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const ADMIN_OFFICE_COOKIE = "cod_admin_office";
const STOREFRONT_OFFICE_COOKIE = "cod_office";

export async function getActiveOffices() {
  return prisma.office.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function getCurrentAdminOffice() {
  const store = await cookies();
  const cookieId = store.get(ADMIN_OFFICE_COOKIE)?.value;
  const offices = await getActiveOffices();
  if (offices.length === 0) return null;
  const found = cookieId ? offices.find((o) => o.id === cookieId) : undefined;
  return found ?? offices[0];
}

export async function setAdminOfficeCookie(officeId: string) {
  const store = await cookies();
  store.set(ADMIN_OFFICE_COOKIE, officeId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/**
 * Resolves which office a storefront visitor belongs to: explicit `?office=NG`
 * query param wins (and is persisted to a cookie for the rest of the visit),
 * otherwise the sticky cookie from a previous visit, otherwise the landing
 * page's configured default office, otherwise the first active office.
 */
export async function resolveStorefrontOffice(officeQueryParam?: string, landingPageOfficeId?: string | null) {
  const offices = await getActiveOffices();
  if (offices.length === 0) return null;

  if (officeQueryParam) {
    const byCode = offices.find((o) => o.countryCode.toLowerCase() === officeQueryParam.toLowerCase());
    if (byCode) return byCode;
  }

  const store = await cookies();
  const cookieCode = store.get(STOREFRONT_OFFICE_COOKIE)?.value;
  const byCookie = cookieCode ? offices.find((o) => o.countryCode.toLowerCase() === cookieCode.toLowerCase()) : undefined;
  if (byCookie) return byCookie;

  if (landingPageOfficeId) {
    const byLandingPage = offices.find((o) => o.id === landingPageOfficeId);
    if (byLandingPage) return byLandingPage;
  }

  return offices[0];
}

export async function setStorefrontOfficeCookie(countryCode: string) {
  const store = await cookies();
  store.set(STOREFRONT_OFFICE_COOKIE, countryCode, { path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export { STOREFRONT_OFFICE_COOKIE };
