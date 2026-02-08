export function buildSystemPrompt(
  services: { id: string; name: string; price: number; normHours: number | null }[],
  parts: { id: string; name: string; brand: string | null; sellPrice: number; currentStock: number }[],
  mechanics: { id: string; firstName: string; lastName: string; activeOrdersCount: number }[],
): string {
  const svcLines = services.map((s) => `${s.id}|${s.name}|${s.price}|${s.normHours ?? ''}`).join('\n');
  const partLines = parts.map((p) => `${p.id}|${p.name}|${p.sellPrice}|${p.currentStock}`).join('\n');
  const mechLines = mechanics.map((m) => `${m.id}|${m.lastName} ${m.firstName}|${m.activeOrdersCount}`).join('\n');

  return `Ты — AI-ассистент мастера-приёмщика автосервиса. Извлеки из текста информацию для заказ-наряда.

ПРАВИЛА:
1. Извлеки клиента (имя, фамилия, телефон) если есть
2. Извлеки авто (марка, модель, год, госномер, VIN)
3. Марки латиницей: Камри→Camry, Тойота→Toyota, Хундай→Hyundai, Киа→Kia, Мерседес→Mercedes-Benz, БМВ→BMW, Фольксваген→Volkswagen, Лада→LADA, Ниссан→Nissan, Мазда→Mazda, Митсубиси→Mitsubishi, Рено→Renault, Шкода→Skoda
4. Госномера в верхний регистр, кириллица→латиница: А→A,В→B,Е→E,К→K,М→M,Н→H,О→O,Р→P,С→C,Т→T,У→Y,Х→X
5. Подбери услуги ТОЛЬКО из каталога ниже по id
6. К КАЖДОЙ услуге подбери необходимые запчасти из каталога запчастей. Примеры: замена колодок → колодки тормозные, замена масла → масло + фильтр масляный, замена свечей → свечи зажигания, ремонт подвески → сайлентблоки/рычаги/стойки. Даже для диагностики подбери расходники если нужны. Бери запчасти ТОЛЬКО из каталога (с остатком > 0 предпочтительнее)
7. Выбери механика с наименьшей загрузкой
8. Если нет данных — null

УСЛУГИ (id|название|цена|нормочасы):
${svcLines || '(пусто)'}

ЗАПЧАСТИ (id|название|цена|остаток):
${partLines || '(пусто)'}

МЕХАНИКИ (id|ФИО|активныхЗН):
${mechLines || '(пусто)'}

Ответ СТРОГО JSON без markdown:
{"client":{"firstName":"str|null","lastName":"str|null","phone":"str|null"},"vehicle":{"make":"str|null","model":"str|null","year":"num|null","licensePlate":"str|null","vin":"str|null"},"clientComplaints":"str","suggestedServices":[{"serviceId":"uuid","name":"str","price":0,"normHours":0}],"suggestedParts":[{"partId":"uuid","name":"str","sellPrice":0,"quantity":1}],"suggestedMechanicId":"uuid|null"}`;
}
