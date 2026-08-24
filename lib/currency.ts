// Centralized currency formatting — never format money ad hoc in components.
// Every office configures its own symbol, position, decimals and separators,
// so the same function must work for every current and future office.

export type CurrencyFormat = {
  currencySymbol: string;
  symbolPosition: string; // "before" | "after"
  decimalDigits: number;
  thousandSeparator: string;
  decimalSeparator: string;
};

export function formatMoney(amount: number | string, format: CurrencyFormat): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const fixed = value.toFixed(format.decimalDigits);
  const [wholePart, fractionPart] = fixed.split(".");
  const withThousands = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, format.thousandSeparator);
  const number = fractionPart ? `${withThousands}${format.decimalSeparator}${fractionPart}` : withThousands;
  return format.symbolPosition === "after" ? `${number}${format.currencySymbol}` : `${format.currencySymbol}${number}`;
}
