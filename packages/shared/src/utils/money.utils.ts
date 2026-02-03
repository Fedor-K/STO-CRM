/**
 * Форматирование суммы в рублях
 */
export function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Расчёт маржи
 */
export function calculateMargin(revenue: number, cost: number): number {
  return revenue - cost;
}

/**
 * Расчёт процента маржи
 */
export function calculateMarginPercent(revenue: number, cost: number): number {
  if (revenue === 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * Проверка правила >5% изменения стоимости
 */
export function isPriceChangeExceeded(
  approvedAmount: number,
  newAmount: number,
  threshold = 0.05,
): boolean {
  if (approvedAmount === 0) return false;
  const change = Math.abs(newAmount - approvedAmount) / approvedAmount;
  return change > threshold;
}

/**
 * Расчёт зарплаты приёмщика по ступеням маржи
 */
export function calculateReceptionistSalary(
  baseSalary: number,
  totalMargin: number,
): { baseSalary: number; bonus: number; rate: number; total: number } {
  let rate = 0;

  if (totalMargin > 1_500_000) {
    rate = 0.06;
  } else if (totalMargin > 1_200_000) {
    rate = 0.05;
  } else if (totalMargin > 1_000_000) {
    rate = 0.04;
  } else if (totalMargin > 800_000) {
    rate = 0.03;
  }

  const bonus = totalMargin * rate;

  return {
    baseSalary,
    bonus: Math.round(bonus),
    rate,
    total: baseSalary + Math.round(bonus),
  };
}
