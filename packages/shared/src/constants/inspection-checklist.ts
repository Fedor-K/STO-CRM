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
