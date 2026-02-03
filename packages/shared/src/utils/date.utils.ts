/**
 * Форматирование даты (дд.мм.гггг)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Форматирование даты и времени (дд.мм.гггг чч:мм)
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Дата follow-up (через 2 дня после выдачи)
 */
export function getFollowUpDate(completionDate: Date | string): Date {
  const d = typeof completionDate === 'string' ? new Date(completionDate) : new Date(completionDate);
  d.setDate(d.getDate() + 2);
  return d;
}

/**
 * Генерация номера заказ-наряда (WO-00001)
 */
export function generateWorkOrderNumber(sequenceNumber: number): string {
  return `WO-${String(sequenceNumber).padStart(5, '0')}`;
}
