const symbols: Record<string, string> = {
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
}

export function formatCurrency(value: number, currencyCode: string | null | undefined): string {
  const symbol = symbols[currencyCode ?? ''] ?? (currencyCode ? `${currencyCode} ` : '')
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
