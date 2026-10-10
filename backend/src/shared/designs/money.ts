/** Prices on tickets are in Sierra Leonean leones, e.g. "Le 150" or "Le 1,250.50". */
export function formatLeones(amount: number): string {
  return `Le ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
