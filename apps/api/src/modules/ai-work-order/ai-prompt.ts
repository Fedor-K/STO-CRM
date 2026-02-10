export function buildSystemPrompt(
  services: { id: string; name: string; price: number; normHours: number | null }[],
  parts: { id: string; name: string; brand: string | null; sellPrice: number; currentStock: number }[],
  mechanics: { id: string; firstName: string; lastName: string; activeOrdersCount: number }[],
): string {
  // Services and parts catalogs are no longer sent to AI — spravochnik handles selection.
  // AI only parses: client, vehicle, complaint, mechanic.
  const mechLines = mechanics.map((m) => `${m.id}|${m.lastName} ${m.firstName}|${m.activeOrdersCount}`).join('\n');

  return `Ты — AI-ассистент мастера-приёмщика автосервиса. Извлеки из текста информацию для заказ-наряда.

ПРАВИЛА:
1. Извлеки клиента (имя, фамилия, телефон) если есть
2. Извлеки авто (марка, модель, год, госномер, VIN)
3. Марки латиницей: Камри→Camry, Тойота→Toyota, Хундай→Hyundai, Киа→Kia, Мерседес→Mercedes-Benz, БМВ→BMW, Фольксваген→Volkswagen, Лада→LADA, Ниссан→Nissan, Мазда→Mazda, Митсубиси→Mitsubishi, Рено→Renault, Шкода→Skoda
4. Госномера в верхний регистр, кириллица→латиница: А→A,В→B,Е→E,К→K,М→M,Н→H,О→O,Р→P,С→C,Т→T,У→Y,Х→X
5. Извлеки жалобу клиента как есть из текста
6. Выбери механика с наименьшей загрузкой
7. Если нет данных — null
8. suggestedServices и suggestedParts — ВСЕГДА пустые массивы (подбор делает справочник)

МЕХАНИКИ (id|ФИО|активныхЗН):
${mechLines || '(пусто)'}

Ответ СТРОГО JSON без markdown:
{"client":{"firstName":"str|null","lastName":"str|null","phone":"str|null"},"vehicle":{"make":"str|null","model":"str|null","year":"num|null","licensePlate":"str|null","vin":"str|null"},"clientComplaints":"str","suggestedServices":[],"suggestedParts":[],"suggestedMechanicId":"uuid|null"}`;
}

export interface VehicleHistoryEntry {
  service: string;
  parts: { name: string; avgPrice: number; count: number }[];
}

export function formatVehicleHistory(
  make: string,
  model: string,
  history: VehicleHistoryEntry[],
): string {
  if (history.length === 0) return '';

  const lines = history.map((h) => {
    const partList = h.parts.map((p) => `${p.name} ~${p.avgPrice}₽ (${p.count}×)`).join(', ');
    return `- При "${h.service}": ${partList}`;
  });

  return `\nИСТОРИЯ ИСПОЛЬЗОВАНИЯ НА ${make} ${model} (из прошлых ЗН нашего автосервиса):
${lines.join('\n')}
ВАЖНО: используй историю как подсказку для подбора запчастей. Если в истории видно, какие запчасти реально ставились на этот авто — предпочитай их. Но бери ТОЛЬКО из каталога выше (по id).`;
}

export function buildAdjustPrompt(
  vehicle: { make: string; model: string; year: number | null },
  complaint: string,
  currentServices: { serviceId: string; name: string }[],
  currentParts: { partId: string; name: string }[],
  services: { id: string; name: string; price: number; normHours: number | null }[],
  parts: { id: string; name: string; sellPrice: number; currentStock: number }[],
  history?: VehicleHistoryEntry[],
): string {
  const svcLines = services.map((s) => `${s.id}|${s.name}|${s.price}|${s.normHours ?? ''}`).join('\n');
  const partLines = parts.map((p) => `${p.id}|${p.name}|${p.sellPrice}|${p.currentStock}`).join('\n');

  const curSvc = currentServices.map((s) => `${s.serviceId}|${s.name}`).join('\n');
  const curParts = currentParts.map((p) => `${p.partId}|${p.name}`).join('\n');

  const historySection = history?.length
    ? formatVehicleHistory(vehicle.make, vehicle.model, history)
    : '';

  return `Ты — AI-ассистент автосервиса. Пользователь сменил автомобиль. Скорректируй подобранные услуги и запчасти с учётом конкретного авто.

АВТОМОБИЛЬ: ${vehicle.make} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''}
ЖАЛОБА: ${complaint}

ТЕКУЩИЕ УСЛУГИ:
${curSvc || '(пусто)'}

ТЕКУЩИЕ ЗАПЧАСТИ:
${curParts || '(пусто)'}

ПРАВИЛА:
1. Определи тип КПП автомобиля по марке/модели (МКПП, АКПП, вариатор, робот, DSG, и т.д.)
2. Если жалоба связана со сцеплением, а у авто АКПП/вариатор (нет сцепления) — замени на диагностику АКПП, убери запчасти сцепления
3. Если жалоба связана с КПП и у авто МКПП/робот — оставь диагностику КПП и запчасти сцепления
4. Аналогично для других систем: подбирай услуги и запчасти, подходящие именно для этого авто
5. Бери услуги и запчасти ТОЛЬКО из каталогов ниже (по id)
6. Не меняй то, что уже корректно подобрано
7. Если есть ИСТОРИЯ ИСПОЛЬЗОВАНИЯ — учитывай её при подборе запчастей, предпочитай проверенные комбинации

КАТАЛОГ УСЛУГ (id|название|цена|нормочасы):
${svcLines || '(пусто)'}

КАТАЛОГ ЗАПЧАСТЕЙ (id|название|цена|остаток):
${partLines || '(пусто)'}
${historySection}
Ответ СТРОГО JSON без markdown:
{"suggestedServices":[{"serviceId":"uuid","name":"str","price":0,"normHours":0}],"suggestedParts":[{"partId":"uuid","name":"str","sellPrice":0,"quantity":1}],"explanation":"краткое пояснение что изменилось и почему"}`;
}
