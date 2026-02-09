export function buildSystemPrompt(
  services: { id: string; name: string; price: number; normHours: number | null }[],
  parts: { id: string; name: string; brand: string | null; sellPrice: number; currentStock: number }[],
  mechanics: { id: string; firstName: string; lastName: string; activeOrdersCount: number }[],
  history?: { make: string; model: string; entries: VehicleHistoryEntry[] },
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
5. Подбери услуги ТОЛЬКО из каталога ниже по id. ВАЖНО: выбирай услугу, ТОЧНО соответствующую жалобе клиента и упомянутой системе авто. Не путай системы: тормоза → диагностика тормозной системы (НЕ подвески), двигатель/мотор/троит/дым → диагностика двигателя, подвеска/стук/люфт → диагностика подвески, кондиционер → диагностика кондиционера. Всегда соотноси название услуги с конкретной жалобой
6. КОРОБКА ПЕРЕДАЧ И СЦЕПЛЕНИЕ: определи тип КПП по марке/модели. Если жалоба на сцепление/КПП:
   - АКПП/вариатор/CVT (BMW X3/X5, Toyota Camry, Hyundai Solaris АКПП, Subaru с CVT и т.д.) → услуга "Диагностика АКПП", запчасти: масло ATF/фильтр АКПП. НЕ добавляй комплект сцепления/диск сцепления/корзину — у АКПП/CVT нет сцепления!
   - МКПП/робот/DSG (Lada, Renault Logan МКПП, VW с DSG, Mitsubishi Lancer Evo и т.д.) → услуга "Диагностика КПП", запчасти: комплект сцепления, выжимной подшипник
   - Запчасти должны СТРОГО соответствовать типу КПП. Не ставь сцепление на автомат и не ставь ATF на механику
7. К КАЖДОЙ услуге подбери необходимые запчасти из каталога запчастей. Примеры: замена колодок → колодки тормозные, замена масла → масло + фильтр масляный, замена свечей → свечи зажигания, ремонт подвески → сайлентблоки/рычаги/стойки. Даже для диагностики подбери расходники если нужны. Бери запчасти ТОЛЬКО из каталога (с остатком > 0 предпочтительнее)
8. ВАЖНО: учитывай совместимость запчастей с автомобилем. Для масел выбирай правильную вязкость по марке/модели (например: Mazda 3 → 5W-30, не 5W-40; Toyota Camry 2.5 → 0W-20 или 5W-30; Hyundai/Kia → 5W-30; BMW → 5W-30 LL-01; Mercedes → 5W-30 MB 229.5; VW/Skoda → 5W-30 504/507). Для фильтров и колодок выбирай подходящие по размеру/типу. Не бери запчасти в промышленной таре (200л бочки) — выбирай малую фасовку (1–5л)
9. Выбери механика с наименьшей загрузкой
10. Если нет данных — null

УСЛУГИ (id|название|цена|нормочасы):
${svcLines || '(пусто)'}

ЗАПЧАСТИ (id|название|цена|остаток):
${partLines || '(пусто)'}

МЕХАНИКИ (id|ФИО|активныхЗН):
${mechLines || '(пусто)'}
${history?.entries.length ? formatVehicleHistory(history.make, history.model, history.entries) : ''}
Ответ СТРОГО JSON без markdown:
{"client":{"firstName":"str|null","lastName":"str|null","phone":"str|null"},"vehicle":{"make":"str|null","model":"str|null","year":"num|null","licensePlate":"str|null","vin":"str|null"},"clientComplaints":"str","suggestedServices":[{"serviceId":"uuid","name":"str","price":0,"normHours":0}],"suggestedParts":[{"partId":"uuid","name":"str","sellPrice":0,"quantity":1}],"suggestedMechanicId":"uuid|null"}`;
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
