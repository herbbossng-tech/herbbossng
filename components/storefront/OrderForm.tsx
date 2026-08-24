"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Select, FieldError } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/currency";
import { trackEvent } from "@/lib/analytics-client";

type Division = { id: string; name: string; cities: { id: string; name: string }[] };

export function OrderForm({
  productId,
  officeId,
  offerId,
  total,
  currencyFormat,
  divisionLabel,
  phoneCountryCode,
  phoneRegex,
  divisions,
  landingPageSlug,
  idempotencyKey,
}: {
  productId: string;
  officeId: string;
  offerId: string;
  total: number;
  currencyFormat: { currencySymbol: string; symbolPosition: string; decimalDigits: number; thousandSeparator: string; decimalSeparator: string };
  divisionLabel: string;
  phoneCountryCode: string;
  phoneRegex: string;
  divisions: Division[];
  landingPageSlug: string;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [startedTracked, setStartedTracked] = useState(false);

  const selectedDivision = useMemo(() => divisions.find((d) => d.id === divisionId), [divisions, divisionId]);
  const money = formatMoney(total, currencyFormat);

  function trackFormStarted() {
    if (startedTracked) return;
    setStartedTracked(true);
    trackEvent("begin_checkout", { officeId, productId, landingPageSlug, value: total, currency: currencyFormat.currencySymbol });
  }

  function validate() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter your full name";
    let regex: RegExp | null = null;
    try {
      regex = new RegExp(phoneRegex);
    } catch {
      regex = null;
    }
    if (!phone.trim() || (regex && !regex.test(phone.trim()))) next.phone = "Enter a valid phone number";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email";
    if (address.trim().length < 5) next.address = "Enter your full delivery address";
    if (!cityId) next.city = "Select your town / city";
    if (!divisionId) next.division = `Select your ${divisionLabel.toLowerCase()}`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (website) return; // honeypot triggered — silently drop
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          officeId,
          offerId,
          idempotencyKey,
          customerName: name,
          customerPhone: `${phoneCountryCode}${phone.replace(/^0+/, "")}`,
          customerEmail: email || undefined,
          deliveryAddress: address,
          divisionId,
          cityId,
          landingPageSlug,
          utmSource: params.get("utm_source") ?? undefined,
          utmMedium: params.get("utm_medium") ?? undefined,
          utmCampaign: params.get("utm_campaign") ?? undefined,
          utmContent: params.get("utm_content") ?? undefined,
          utmTerm: params.get("utm_term") ?? undefined,
          fbclid: params.get("fbclid") ?? undefined,
          gclid: params.get("gclid") ?? undefined,
          fbp: readCookie("_fbp"),
          fbc: readCookie("_fbc"),
          referrer: document.referrer || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/thank-you/${data.orderNumber}`);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" id="order-form">
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
      />
      <div>
        <Label htmlFor="name">
          Full Name <span className="text-red-500">*</span>
        </Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} onFocus={trackFormStarted} placeholder="e.g. Amaka Johnson" required />
        <FieldError>{errors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="phone">
          Phone <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2">
          <span className="flex items-center rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500">
            {phoneCountryCode}
          </span>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0801 234 5678" required inputMode="tel" />
        </div>
        <FieldError>{errors.phone}</FieldError>
      </div>
      <div>
        <Label htmlFor="email">Email (optional)</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
        <FieldError>{errors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="address">
          Delivery Address <span className="text-red-500">*</span>
        </Label>
        <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your full delivery address" required />
        <FieldError>{errors.address}</FieldError>
      </div>
      <div>
        <Label htmlFor="division">
          {divisionLabel} <span className="text-red-500">*</span>
        </Label>
        <Select
          id="division"
          value={divisionId}
          onChange={(e) => {
            setDivisionId(e.target.value);
            setCityId("");
          }}
          required
        >
          <option value="">Select your {divisionLabel.toLowerCase()}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <FieldError>{errors.division}</FieldError>
      </div>
      <div>
        <Label htmlFor="city">
          Town / City <span className="text-red-500">*</span>
        </Label>
        <Select id="city" value={cityId} onChange={(e) => setCityId(e.target.value)} required disabled={!selectedDivision}>
          <option value="">Your city</option>
          {selectedDivision?.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <FieldError>{errors.city}</FieldError>
      </div>

      {serverError && <FieldError>{serverError}</FieldError>}

      <Button type="submit" size="lg" variant="primary" className="w-full" disabled={submitting}>
        {submitting ? "Placing order…" : `Place Order — ${money}`}
      </Button>
      <p className="text-center text-xs text-zinc-400">Pay cash when your order arrives at your door.</p>
    </form>
  );
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
