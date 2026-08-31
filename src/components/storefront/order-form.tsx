'use client';

import { useMemo, useState } from 'react';

export interface DivisionOption {
  id: string;
  name: string;
  cities: { id: string; name: string; deliveryAreas: { id: string; name: string; fee: number | null }[] }[];
}

export interface OrderFormValues {
  customerName: string;
  phone: string;
  email: string;
  deliveryAddress: string;
  divisionId: string;
  cityId: string;
  deliveryAreaId: string;
  customerNotes: string;
}

export function OrderForm({
  divisionLabel,
  phoneCountryCode,
  divisions,
  ctaLabel,
  submitting,
  error,
  onSubmit,
  onDeliveryAreaChange,
}: {
  divisionLabel: string;
  phoneCountryCode: string;
  divisions: DivisionOption[];
  ctaLabel: string;
  submitting: boolean;
  error?: string;
  onSubmit: (values: OrderFormValues) => void;
  onDeliveryAreaChange?: (areaId: string) => void;
}) {
  const [values, setValues] = useState<OrderFormValues>({
    customerName: '',
    phone: '',
    email: '',
    deliveryAddress: '',
    divisionId: '',
    cityId: '',
    deliveryAreaId: '',
    customerNotes: '',
  });
  const [touched, setTouched] = useState(false);

  const selectedDivision = useMemo(() => divisions.find((d) => d.id === values.divisionId), [divisions, values.divisionId]);
  const selectedCity = useMemo(() => selectedDivision?.cities.find((c) => c.id === values.cityId), [selectedDivision, values.cityId]);

  function update<K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === 'divisionId') {
        next.cityId = '';
        next.deliveryAreaId = '';
      }
      if (key === 'cityId') {
        next.deliveryAreaId = '';
      }
      return next;
    });
    if (key === 'deliveryAreaId') onDeliveryAreaChange?.(value as string);
  }

  const errors: Partial<Record<keyof OrderFormValues, string>> = {};
  if (touched) {
    if (values.customerName.trim().length < 2) errors.customerName = 'Please enter your full name';
    if (values.phone.trim().length < 5) errors.phone = 'Please enter a valid phone number';
    if (values.deliveryAddress.trim().length < 5) errors.deliveryAddress = 'Please enter your delivery address';
    if (!values.divisionId) errors.divisionId = `Please select your ${divisionLabel.toLowerCase()}`;
    if (!values.cityId) errors.cityId = 'Please select your city/town';
  }

  return (
    <form
      id="order-form"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (values.customerName.trim().length < 2 || values.phone.trim().length < 5 || values.deliveryAddress.trim().length < 5 || !values.divisionId || !values.cityId) {
          return;
        }
        onSubmit(values);
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-brand-dark">Full Name *</label>
        <input
          value={values.customerName}
          onChange={(e) => update('customerName', e.target.value)}
          placeholder="e.g. Amaka Johnson"
          className={`w-full rounded-xl border px-4 py-3.5 text-base outline-none focus:border-brand ${errors.customerName ? 'border-red-400' : 'border-brand-dark/15'}`}
        />
        {errors.customerName && <p className="mt-1 text-xs text-red-600">{errors.customerName}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-dark">Phone *</label>
        <div className="flex gap-2">
          <span className="flex items-center rounded-xl border border-brand-dark/15 px-3 text-sm text-brand-dark/60">{phoneCountryCode}</span>
          <input
            value={values.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="080..."
            className={`w-full rounded-xl border px-4 py-3.5 text-base outline-none focus:border-brand ${errors.phone ? 'border-red-400' : 'border-brand-dark/15'}`}
          />
        </div>
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-dark">Email (optional)</label>
        <input
          type="email"
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="you@email.com"
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3.5 text-base outline-none focus:border-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-dark">Delivery Address *</label>
        <input
          value={values.deliveryAddress}
          onChange={(e) => update('deliveryAddress', e.target.value)}
          placeholder="Enter your full delivery address"
          className={`w-full rounded-xl border px-4 py-3.5 text-base outline-none focus:border-brand ${errors.deliveryAddress ? 'border-red-400' : 'border-brand-dark/15'}`}
        />
        {errors.deliveryAddress && <p className="mt-1 text-xs text-red-600">{errors.deliveryAddress}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-dark">{divisionLabel} *</label>
          <select
            value={values.divisionId}
            onChange={(e) => update('divisionId', e.target.value)}
            className={`w-full rounded-xl border bg-white px-4 py-3.5 text-base outline-none focus:border-brand ${errors.divisionId ? 'border-red-400' : 'border-brand-dark/15'}`}
          >
            <option value="">Select your {divisionLabel.toLowerCase()}</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {errors.divisionId && <p className="mt-1 text-xs text-red-600">{errors.divisionId}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-brand-dark">Town / City *</label>
          <select
            value={values.cityId}
            onChange={(e) => update('cityId', e.target.value)}
            disabled={!selectedDivision}
            className={`w-full rounded-xl border bg-white px-4 py-3.5 text-base outline-none focus:border-brand disabled:opacity-50 ${errors.cityId ? 'border-red-400' : 'border-brand-dark/15'}`}
          >
            <option value="">Your city</option>
            {selectedDivision?.cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.cityId && <p className="mt-1 text-xs text-red-600">{errors.cityId}</p>}
        </div>
      </div>

      {selectedCity && selectedCity.deliveryAreas.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-dark">Delivery Area (optional)</label>
          <select
            value={values.deliveryAreaId}
            onChange={(e) => update('deliveryAreaId', e.target.value)}
            className="w-full rounded-xl border border-brand-dark/15 bg-white px-4 py-3.5 text-base outline-none focus:border-brand"
          >
            <option value="">Select delivery area</option>
            {selectedCity.deliveryAreas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-dark">Order notes (optional)</label>
        <textarea
          value={values.customerNotes}
          onChange={(e) => update('customerNotes', e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-brand-dark/15 px-4 py-3.5 text-base outline-none focus:border-brand"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 w-full rounded-full bg-brand py-4 text-center text-base font-bold text-white shadow-cardSelected transition hover:bg-brand-light disabled:opacity-60"
      >
        {submitting ? 'Placing order…' : ctaLabel}
      </button>
    </form>
  );
}
