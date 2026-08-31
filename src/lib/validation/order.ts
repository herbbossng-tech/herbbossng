import { z } from 'zod';

export const createOrderSchema = z.object({
  officeId: z.string().min(1),
  productId: z.string().min(1),
  offerId: z.string().min(1),
  landingPageId: z.string().optional(),

  customerName: z.string().min(2, 'Please enter your full name'),
  phone: z.string().min(5, 'Please enter a valid phone number'),
  email: z.string().email().optional().or(z.literal('')),
  deliveryAddress: z.string().min(5, 'Please enter your delivery address'),
  divisionId: z.string().min(1, 'Please select this field'),
  cityId: z.string().min(1, 'Please select your city/town'),
  deliveryAreaId: z.string().optional().or(z.literal('')),
  customerNotes: z.string().optional(),

  idempotencyKey: z.string().min(10),

  // attribution — all optional, captured client-side from the URL/pixel cookies
  source: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
  eventId: z.string().optional(),
  landingPageUrl: z.string().optional(),
  referrer: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
