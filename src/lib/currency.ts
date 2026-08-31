import type { Office } from '@prisma/client';

type CurrencyConfig = Pick<
  Office,
  | 'currencySymbol'
  | 'currencySymbolPosition'
  | 'currencyDecimalPlaces'
  | 'currencyThousandSep'
  | 'currencyDecimalSep'
>;

/**
 * Formats a number/Decimal into money using the office's own currency config —
 * never assumes 2 decimal places or a fixed symbol position.
 */
export function formatMoney(amount: number | string | { toString(): string }, office: CurrencyConfig): string {
  const value = typeof amount === 'number' ? amount : Number(amount.toString());
  const decimals = office.currencyDecimalPlaces;
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, office.currencyThousandSep);
  const numberStr = decPart ? `${withThousands}${office.currencyDecimalSep}${decPart}` : withThousands;

  return office.currencySymbolPosition === 'BEFORE'
    ? `${office.currencySymbol}${numberStr}`
    : `${numberStr}${office.currencySymbol}`;
}

export function roundMoney(amount: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(amount * factor) / factor;
}
