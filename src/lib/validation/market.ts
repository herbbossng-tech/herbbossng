/**
 * Market-aware phone validation for the public COD order form. GCOS
 * operates across multiple African markets — this must not hardcode
 * one country's number format into the whole system. The active
 * landing page's market (from landing_pages.market_country_code,
 * copied from its workspace at creation time) selects which config
 * applies; unknown/future markets fall back to a lenient default
 * rather than breaking the form.
 */
export interface MarketConfig {
  countryCode: string
  name: string
  dialCode: string
  phonePlaceholder: string
  /** Expected length of the national significant number (after stripping a leading 0 or the dial code). */
  nationalLength: number
}

const MARKETS: Record<string, MarketConfig> = {
  NG: { countryCode: 'NG', name: 'Nigerian', dialCode: '234', phonePlaceholder: '0801 234 5678', nationalLength: 10 },
  KE: { countryCode: 'KE', name: 'Kenyan', dialCode: '254', phonePlaceholder: '0712 345 678', nationalLength: 9 },
  GH: { countryCode: 'GH', name: 'Ghanaian', dialCode: '233', phonePlaceholder: '024 123 4567', nationalLength: 9 },
  ZA: { countryCode: 'ZA', name: 'South African', dialCode: '27', phonePlaceholder: '071 234 5678', nationalLength: 9 },
}

const DEFAULT_MARKET: MarketConfig = {
  countryCode: '',
  name: 'phone',
  dialCode: '',
  phonePlaceholder: 'Phone number',
  nationalLength: 7,
}

export function getMarketConfig(countryCode: string | null | undefined): MarketConfig {
  if (!countryCode) return DEFAULT_MARKET
  return MARKETS[countryCode] ?? DEFAULT_MARKET
}

export function validateMarketPhone(phone: string, market: MarketConfig): boolean {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 0) return false

  let national = digits
  if (market.dialCode && national.startsWith(market.dialCode)) {
    national = national.slice(market.dialCode.length)
  } else if (national.startsWith('0')) {
    national = national.slice(1)
  }

  if (market === DEFAULT_MARKET) {
    return national.length >= market.nationalLength
  }
  return national.length === market.nationalLength
}
