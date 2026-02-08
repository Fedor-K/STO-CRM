export interface InspectionItem {
  key: string;
  label: string;
}

export interface InspectionGroup {
  key: string;
  label: string;
  items: InspectionItem[];
}

export interface InspectionChecklistEntry {
  checked: boolean;
  note: string;
  level?: number; // 0-100, для жидкостей (масло, ОЖ и т.д.)
  recommended?: boolean; // пункт добавлен как рекомендованная работа
  recommendedDescription?: string; // название услуги для связи с WO item
}

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
  defaultValue: number;
}

/** Пункты, у которых есть ползунок */
export const SLIDER_CONFIG: Record<string, SliderConfig> = {
  // Уровни жидкостей (0–100%)
  urovenMotornogMasla:        { min: 0, max: 100, step: 5,   unit: '%', label: 'Уровень', defaultValue: 50 },
  urovenMaslaKpp:             { min: 0, max: 100, step: 5,   unit: '%', label: 'Уровень', defaultValue: 50 },
  urovenMaslaGur:             { min: 0, max: 100, step: 5,   unit: '%', label: 'Уровень', defaultValue: 50 },
  ohlazhdayushhayaZhidkost:   { min: 0, max: 100, step: 5,   unit: '%', label: 'Уровень', defaultValue: 50 },
  stekloomyvayushhayaZhidkost:{ min: 0, max: 100, step: 5,   unit: '%', label: 'Уровень', defaultValue: 50 },
  // Тормозная жидкость — содержание влаги (0–5%)
  tormoznayaZhidkost:         { min: 0, max: 5,   step: 0.1, unit: '%', label: 'Влага',   defaultValue: 0 },
  // Тормозные колодки — остаток (0–100%)
  perednieTormoznyeKolodki:   { min: 0, max: 100, step: 5,   unit: '%', label: 'Остаток', defaultValue: 100 },
  zadnieTormoznyeKolodki:     { min: 0, max: 100, step: 5,   unit: '%', label: 'Остаток', defaultValue: 100 },
};

/** @deprecated Use SLIDER_CONFIG instead */
export const LEVEL_ITEMS = new Set(Object.keys(SLIDER_CONFIG));

export interface AutoRecommendConfig {
  /** Порог: если значение ниже (или выше для 'above') — авторекомендация */
  threshold: number;
  /** 'below' = рекомендовать когда level ≤ threshold, 'above' = когда level ≥ threshold */
  direction: 'below' | 'above';
  /** Поисковый запрос для автоподбора услуги */
  searchQuery: string;
}

/** Авторекомендации: когда ползунок в критической зоне → автоматически подбирается услуга */
export const AUTO_RECOMMEND_CONFIG: Record<string, AutoRecommendConfig> = {
  perednieTormoznyeKolodki:   { threshold: 30, direction: 'below', searchQuery: 'колодки передн' },
  zadnieTormoznyeKolodki:     { threshold: 30, direction: 'below', searchQuery: 'колодки задн' },
  tormoznayaZhidkost:         { threshold: 3,  direction: 'above', searchQuery: 'тормозная жидкость' },
  urovenMotornogMasla:        { threshold: 25, direction: 'below', searchQuery: 'масло моторн' },
  urovenMaslaKpp:             { threshold: 25, direction: 'below', searchQuery: 'масло КПП' },
  urovenMaslaGur:             { threshold: 25, direction: 'below', searchQuery: 'масло ГУР' },
  ohlazhdayushhayaZhidkost:   { threshold: 25, direction: 'below', searchQuery: 'охлаждающая жидкость' },
  stekloomyvayushhayaZhidkost:{ threshold: 25, direction: 'below', searchQuery: 'стеклоомывающая' },
};

/** Проверяет, находится ли значение ползунка в критической зоне */
export function isCriticalLevel(itemKey: string, level: number): boolean {
  const cfg = AUTO_RECOMMEND_CONFIG[itemKey];
  if (!cfg) return false;
  return cfg.direction === 'below' ? level <= cfg.threshold : level >= cfg.threshold;
}

export type InspectionChecklist = Record<string, InspectionChecklistEntry>;

export const INSPECTION_GROUPS: InspectionGroup[] = [
  {
    key: 'electrical',
    label: 'Электрооборудование',
    items: [
      { key: 'gabaritnyeOgni', label: 'Габаритные огни' },
      { key: 'blizhnijSvet', label: 'Ближний свет' },
      { key: 'dalnijSvet', label: 'Дальний свет' },
      { key: 'ukazateliPovorotov', label: 'Указатели поворотов' },
      { key: 'protivotumannyjSvet', label: 'Противотуманный свет' },
      { key: 'zadnijHod', label: 'Задний ход' },
      { key: 'shchotkiStekloochistitelja', label: 'Щётки стеклоочистителя' },
    ],
  },
  {
    key: 'frontSuspension',
    label: 'Передняя подвеска',
    items: [
      { key: 'sajlentblokiRychagov', label: 'Сайлентблоки рычагов подрамника' },
      { key: 'sharovyeOpory', label: 'Шаровые опоры' },
      { key: 'rulevayaRejka', label: 'Рулевая рейка/тяги/наконечники' },
      { key: 'stojkiStabilizatoraPered', label: 'Стойки/втулки стабилизатора' },
      { key: 'stojkaAmortizatora', label: 'Стойка амортизатора' },
      { key: 'pruzhinyPered', label: 'Пружины' },
      { key: 'stupichnyePodshipnikiPered', label: 'Ступичные подшипники' },
      { key: 'privodaShrusyPered', label: 'Привода/ШРУСы' },
      { key: 'pylnikiPered', label: 'Пыльники' },
    ],
  },
  {
    key: 'engineBay',
    label: 'Моторный отсек',
    items: [
      { key: 'oporyDvsKpp', label: 'Опоры ДВС и КПП' },
      { key: 'urovenMotornogMasla', label: 'Уровень моторного масла' },
      { key: 'tormoznayaZhidkost', label: 'Тормозная жидкость' },
      { key: 'urovenMaslaKpp', label: 'Уровень масла КПП' },
      { key: 'urovenMaslaGur', label: 'Уровень масла ГУРа' },
      { key: 'ohlazhdayushhayaZhidkost', label: 'Уровень/состояние охлаждающей жидкости' },
      { key: 'privodnjeRemni', label: 'Приводные ремни' },
      { key: 'patrubkiRadiatory', label: 'Патрубки/радиаторы' },
      { key: 'vypusknayaSistema', label: 'Выпускная система' },
      { key: 'stekloomyvayushhayaZhidkost', label: 'Уровень стеклоомывающей жидкости' },
    ],
  },
  {
    key: 'rearSuspension',
    label: 'Задняя подвеска',
    items: [
      { key: 'sajlentblokiRychagovZad', label: 'Сайлентблоки рычагов' },
      { key: 'sajlentblokiZadnejBalki', label: 'Сайлентблоки задней балки' },
      { key: 'stojkiStabilizatoraZad', label: 'Стойки/втулки стабилизатора' },
      { key: 'pruzhinyZad', label: 'Пружины' },
      { key: 'stupichnyePodshipnikiZad', label: 'Ступичные подшипники' },
      { key: 'privodaShrusyZad', label: 'Привода/ШРУСы' },
      { key: 'kardannyjVal', label: 'Карданный вал/крестовины' },
    ],
  },
  {
    key: 'wheels',
    label: 'Колёса',
    items: [
      { key: 'glubinaIznosaProtektora', label: 'Глубина износа протектора' },
      { key: 'ravnomernostIznosa', label: 'Равномерность износа протектора' },
      { key: 'davlenieVShinah', label: 'Давление в шинах' },
    ],
  },
  {
    key: 'brakes',
    label: 'Тормозная система',
    items: [
      { key: 'perednieTormoznyeDiski', label: 'Передние тормозные диски' },
      { key: 'perednieTormoznyeKolodki', label: 'Передние тормозные колодки' },
      { key: 'zadnieTormoznyeDiski', label: 'Задние тормозные диски/барабаны' },
      { key: 'zadnieTormoznyeKolodki', label: 'Задние тормозные колодки' },
      { key: 'germetichnostSistemy', label: 'Герметичность системы' },
      { key: 'stoyanochnyjTormoz', label: 'Стояночный тормоз' },
      { key: 'glavnyjTormoznojCilindr', label: 'Главный тормозной цилиндр' },
      { key: 'rabochieTormoznyeCilindry', label: 'Рабочие тормозные цилиндры' },
    ],
  },
];

export function createEmptyChecklist(): InspectionChecklist {
  const checklist: InspectionChecklist = {};
  for (const group of INSPECTION_GROUPS) {
    for (const item of group.items) {
      checklist[item.key] = { checked: false, note: '' };
    }
  }
  return checklist;
}
