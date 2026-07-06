// Константи та чиста логіка для модуля аудитів HACCP.
// Зберігаємо тут шкалу оцінок, інтерпретацію результату, базовий шаблон
// та функцію розрахунку відсотків, щоб компонент лишався сфокусованим на UI.

let idCounter = 0;

export const makeHaccpId = () =>
  `${Date.now().toString(36)}_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const toPositiveNumber = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
};

// Шкала оцінок для пунктів HACCP.
// N/A означає, що пункт не застосовується і не впливає на загальний результат.
export const RATING_SCALE = [
  {
    value: 2,
    key: "excellent",
    label: "Добре",
    short: "Виконується",
    percent: 100,
    selectedClass: "border-emerald-600 bg-emerald-600 text-white shadow-sm",
    idleClass: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700",
  },
  {
    value: 1,
    key: "good",
    label: "Задовільно",
    short: "Частково",
    percent: 50,
    selectedClass: "border-amber-500 bg-amber-500 text-white shadow-sm",
    idleClass: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    dotClass: "bg-amber-500",
    textClass: "text-amber-700",
  },
  {
    value: 0,
    key: "bad",
    label: "Погано",
    short: "Не виконується",
    percent: 0,
    selectedClass: "border-red-600 bg-red-600 text-white shadow-sm",
    idleClass: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    dotClass: "bg-red-500",
    textClass: "text-red-700",
  },
  {
    value: -1,
    key: "na",
    label: "N/A",
    short: "Не застосовується",
    percent: null,
    excludeFromScore: true,
    selectedClass: "border-slate-600 bg-slate-600 text-white shadow-sm",
    idleClass: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
    dotClass: "bg-slate-500",
    textClass: "text-slate-700",
  },
];

export const MAX_RATING_VALUE = 2;

export const RATING_BY_VALUE = RATING_SCALE.reduce((acc, item) => {
  acc[item.value] = item;
  return acc;
}, {});

// Інтерпретація підсумкового відсотка аудиту (рівень оцінки за результатом).
export const GRADE_BANDS = [
  { min: 90, label: "Відмінно", badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-800", barClass: "bg-emerald-500" },
  { min: 80, label: "Добре", badgeClass: "border-lime-300 bg-lime-100 text-lime-800", barClass: "bg-lime-500" },
  { min: 70, label: "Задовільно", badgeClass: "border-amber-300 bg-amber-100 text-amber-800", barClass: "bg-amber-500" },
  { min: 0, label: "Незадовільно", badgeClass: "border-red-300 bg-red-100 text-red-800", barClass: "bg-red-500" },
];

export const gradeBandFor = (percent) => {
  const value = Number(percent) || 0;
  return GRADE_BANDS.find((band) => value >= band.min) || GRADE_BANDS[GRADE_BANDS.length - 1];
};

export const isCommentRequired = (value) =>
  value !== null && value !== undefined && (Number(value) === 1 || Number(value) === 0);

export const isPhotoRequired = (value) =>
  value !== null && value !== undefined && Number(value) === 0;

export const sumWeights = (arr) =>
  Array.isArray(arr) ? arr.reduce((acc, item) => acc + toPositiveNumber(item?.weight, 0), 0) : 0;

export const roundPercent = (value) => Math.round((Number(value) || 0) * 10) / 10;

// ------------------------------------------------------------------
// Підрозділи: розділ може мати або власні пункти (items), або підрозділи
// (subsections), кожен з яких має свої пункти. Хелпери нижче нормалізують
// доступ до цієї структури, щоб решта коду не дублювала логіку.
// ------------------------------------------------------------------

export const hasSubsections = (section) =>
  Array.isArray(section?.subsections) && section.subsections.length > 0;

// Повертає "групи" розділу у нормалізованому вигляді:
// - якщо є підрозділи → масив підрозділів (isSubsection: true);
// - інакше → одна віртуальна група з пунктами розділу (isSubsection: false).
export const getSectionGroups = (section) => {
  if (hasSubsections(section)) {
    return [...section.subsections]
      .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
      .map((sub) => ({
        id: String(sub?.id || ""),
        title: String(sub?.title || ""),
        weight: toPositiveNumber(sub?.weight, 0),
        isSubsection: true,
        items: Array.isArray(sub?.items)
          ? [...sub.items].sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
          : [],
      }));
  }
  return [
    {
      id: String(section?.id || ""),
      title: "",
      weight: 0,
      isSubsection: false,
      items: Array.isArray(section?.items)
        ? [...section.items].sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
        : [],
    },
  ];
};

// Плоский відсортований список усіх пунктів розділу (враховує підрозділи).
export const flattenSectionItems = (section) => {
  if (hasSubsections(section)) {
    return getSectionGroups(section).flatMap((group) => group.items);
  }
  return Array.isArray(section?.items)
    ? [...section.items].sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
    : [];
};

// Розрахунок результату для групи пунктів (спільна логіка для розділу/підрозділу).
const computeItemsResult = (items, responses = {}) => {
  let planWeight = 0;
  let factWeight = 0;
  let assessed = 0;
  let total = 0;

  for (const item of Array.isArray(items) ? items : []) {
    total += 1;
    const itemWeight = toPositiveNumber(item?.weight, 1);
    const response = responses?.[item.id];
    const rating = response && response.value !== null && response.value !== undefined
      ? RATING_BY_VALUE[response.value]
      : null;

    if (rating) {
      assessed += 1;
      if (!rating.excludeFromScore && Number.isFinite(rating.percent)) {
        planWeight += itemWeight;
        factWeight += (itemWeight * rating.percent) / 100;
      }
    }
  }

  const percent = planWeight > 0 ? (factWeight / planWeight) * 100 : 0;
  return { percent, assessed, total, hasData: assessed > 0 };
};

// Розрахунок результату аудиту.
// Логіка така ж, як в Excel: для кожного пункту "План" = його вага,
// "Факт" = вага × відсоток оцінки. Розділ зважується власною вагою.
// Все нормалізується, тож результат завжди в межах 0–100% навіть якщо
// ваги не складаються рівно в 100.
export const computeHaccpScores = (template, responses = {}) => {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const sectionResults = {};
  let totalItems = 0;
  let assessedItems = 0;

  const aggregated = [];

  for (const section of sections) {
    const groups = getSectionGroups(section);
    const usesSubsections = hasSubsections(section);

    let sectionAssessed = 0;
    let sectionTotal = 0;
    const groupAgg = []; // { percent, hasData, weight }

    for (const group of groups) {
      const res = computeItemsResult(group.items, responses);
      totalItems += res.total;
      assessedItems += res.assessed;
      sectionAssessed += res.assessed;
      sectionTotal += res.total;

      if (usesSubsections) {
        // Результат по кожному підрозділу доступний за його id.
        sectionResults[group.id] = {
          percent: res.percent,
          assessed: res.assessed,
          total: res.total,
          hasData: res.hasData,
          weight: toPositiveNumber(group.weight, 0),
        };
      }
      groupAgg.push({ percent: res.percent, hasData: res.hasData, weight: toPositiveNumber(group.weight, 0) });
    }

    // Відсоток розділу: якщо є підрозділи — зважене середнє їхніх відсотків
    // (за вагою підрозділу; якщо ваги нульові — просте середнє). Інакше —
    // відсоток єдиної групи (як у старій логіці по пунктах розділу).
    let sectionPercent = 0;
    let sectionHasData = false;
    if (usesSubsections) {
      const withData = groupAgg.filter((entry) => entry.hasData);
      sectionHasData = withData.length > 0;
      if (withData.length) {
        const wSum = withData.reduce((acc, entry) => acc + entry.weight, 0);
        sectionPercent = wSum > 0
          ? withData.reduce((acc, entry) => acc + entry.percent * entry.weight, 0) / wSum
          : withData.reduce((acc, entry) => acc + entry.percent, 0) / withData.length;
      }
    } else {
      const single = groupAgg[0] || { percent: 0, hasData: false };
      sectionPercent = single.percent;
      sectionHasData = single.hasData;
    }

    const sectionWeight = toPositiveNumber(section?.weight, 0);
    sectionResults[section.id] = {
      percent: sectionPercent,
      assessed: sectionAssessed,
      total: sectionTotal,
      hasData: sectionHasData,
      weight: sectionWeight,
    };

    aggregated.push({ percent: sectionPercent, hasData: sectionHasData, weight: sectionWeight });
  }

  const withData = aggregated.filter((entry) => entry.hasData);
  const weightSum = withData.reduce((acc, entry) => acc + entry.weight, 0);

  let totalPercent = 0;
  if (withData.length) {
    if (weightSum > 0) {
      totalPercent = withData.reduce((acc, entry) => acc + entry.percent * entry.weight, 0) / weightSum;
    } else {
      totalPercent = withData.reduce((acc, entry) => acc + entry.percent, 0) / withData.length;
    }
  }

  return {
    totalPercent,
    sectionResults,
    totalItems,
    assessedItems,
  };
};

// Базовий "під ключ" шаблон HACCP для ресторанів (5 розділів зі стандартними вагами).
// Розділ 1 містить детальні пункти з аудиторської таблиці; інші — типові критерії,
// які адміністратор може відредагувати під конкретний заклад.
const DEFAULT_SECTION_SEED = [
  {
    title: "Інфраструктура технологічних приміщень",
    weight: 10,
    items: [
      "Покриття підлоги ціле, без тріщин і сколів. Відсутнє накопичення бруду в стиках, плінтуси щільно прилягають.",
      "Стіни в зоні обробки виконані з матеріалів, що легко миються, гладкі, без лущення фарби та пошкоджень.",
      "На стелі немає плісняви, тріщин, конденсату; технічні комунікації закриті; достатнє освітлення (≥500 люкс).",
      "Вікна не відкриваються або мають москітні сітки. Підвіконня чисті, не використовуються для зберігання.",
      "Водопідготовка (система фільтрації) справна, відбувається регулярне обслуговування та заміна фільтрів.",
      "Вентиляція та кондиціювання справні, забезпечують температурний режим, повітропроводи чисті.",
    ],
  },
  {
    title: "Санітарний стан приміщень, обладнання та контроль шкідників",
    weight: 35,
    items: [
      "Підлоги чисті, стики плиток без застарілих забруднень, гумові килимки (де є) чисті.",
      "Стіни та стелі чисті, без забруднень, плісняви та павутиння.",
      "Обладнання, інвентар і робочі поверхні чисті та продезінфіковані.",
      "Мийні та дезінфікуючі засоби марковані, зберігаються окремо, мають супровідні документи.",
      "Графік прибирання та дезінфекції розроблено та виконується, ведуться відмітки.",
      "Реалізовано програму контролю шкідників (договір, пастки, журнал перевірок).",
      "Відходи зберігаються в закритих маркованих контейнерах і вчасно видаляються.",
    ],
  },
  {
    title: "Технологічні процеси приймання, зберігання та переробки сировини",
    weight: 25,
    items: [
      "Приймання сировини супроводжується документами якості та безпечності.",
      "Дотримано товарне сусідство під час зберігання (сире та готове розділені).",
      "Температурні режими холодильного й морозильного обладнання дотримані та реєструються.",
      "Дотримано принцип FIFO та контроль термінів придатності продукції.",
      "Маркування напівфабрикатів і готової продукції (дата, час виготовлення, термін).",
      "Розморожування продукції відбувається у відповідних безпечних умовах.",
      "Контроль температури під час теплової обробки готової продукції.",
    ],
  },
  {
    title: "Особиста гігієна та поведінка персоналу",
    weight: 20,
    items: [
      "Персонал у чистому спецодязі, наявні головні убори.",
      "Створено умови для миття та дезінфекції рук (мило, антисептик, рушники).",
      "Персонал миє руки згідно з вимогами, відсутні прикраси на руках.",
      "Медичні книжки наявні та дійсні.",
      "Відсутні ознаки захворювань або незахищених травм у персоналу.",
    ],
  },
  {
    title: "Документація та підготовка персоналу, система HACCP",
    weight: 10,
    items: [
      "Розроблено та впроваджено план HACCP, визначено критичні контрольні точки (ККТ).",
      "Ведуться журнали моніторингу ККТ.",
      "Персонал пройшов навчання з питань безпечності харчових продуктів.",
      "Передбачено та документуються коригувальні дії при відхиленнях.",
    ],
  },
];

export const buildDefaultHaccpTemplate = () => ({
  name: "Аудит безпечності харчових продуктів",
  description: "Базовий аудит HACCP для ресторанів. Відредагуйте розділи, пункти та ваги під свій заклад.",
  isActive: true,
  restaurantIds: [],
  sections: DEFAULT_SECTION_SEED.map((section, sectionIndex) => ({
    id: makeHaccpId(),
    title: section.title,
    weight: section.weight,
    sortOrder: sectionIndex,
    items: section.items.map((title, itemIndex) => ({
      id: makeHaccpId(),
      title,
      description: "",
      weight: 1,
      sortOrder: itemIndex,
    })),
  })),
});
