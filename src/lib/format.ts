/** Цена в гривнах (украинская локаль, символ ₴). */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function formatStock(stock: number): string {
  if (stock >= 1000) {
    return `${(stock / 1000).toFixed(1)} тис.`;
  }
  return String(stock);
}
