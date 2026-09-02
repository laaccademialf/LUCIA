// Розбивка місячного плану продажів (ТО / Гості) на денну та погодинну основу
// за методом аналізу історичних часток.
//
// Ідея:
//   1. День місяця отримує вагу на основі історичного факту:
//      - середнє по останніх N входженнях того самого дня тижня (напр. останні 4 середи);
//      - той самий календарний день рік тому (сезонність);
//      комбінуються з вагами (день тижня 70% + торік 30%), з фолбеком за наявними даними.
//   2. Місячний тотал точно розкладається по днях (метод найбільшого залишку → цілі числа).
//   3. Усередині дня — погодинний профіль того самого дня тижня (частка кожної години
//      від денного тоталу), теж із фолбеком на загальний профіль / рівномірний розподіл.
//
// Усі функції чисті та детерміновані — зручно тестувати окремо.

const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;
const weekdayOf = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay(); // 0=нд ... 6=сб
};
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Розподіляє ціле `total` за вагами `weights` так, щоб сума результату точно
// дорівнювала total (метод найбільшого залишку). Порожні ваги → рівномірно.
export const largestRemainderDistribute = (weights, total) => {
  const n = weights.length;
  const result = new Array(n).fill(0);
  const totalInt = Math.max(0, Math.round(num(total)));
  if (n === 0 || totalInt === 0) return result;

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sumW = safeWeights.reduce((a, b) => a + b, 0);

  if (sumW <= 0) {
    const base = Math.floor(totalInt / n);
    let rem = totalInt - base * n;
    for (let i = 0; i < n; i++) result[i] = base + (i < rem ? 1 : 0);
    return result;
  }

  const raw = safeWeights.map((w) => (w / sumW) * totalInt);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = totalInt - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  const out = floors.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
};

// Індексує історичні записи за датою: { to, guests, hours: { h: { to, guests } } }.
// Кожен запис — { date, hours: { 'HH:00:00': { factTo, factGosti } } }.
const buildHistoryIndex = (history) => {
  const index = new Map();
  for (const rec of Array.isArray(history) ? history : []) {
    const date = String(rec?.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const hoursObj = rec?.hours && typeof rec.hours === "object" ? rec.hours : {};
    const hours = {};
    let to = 0;
    let guests = 0;
    for (const [hour, row] of Object.entries(hoursObj)) {
      const hourTo = num(row?.factTo);
      const hourGuests = num(row?.factGosti);
      hours[hour] = { to: hourTo, guests: hourGuests };
      to += hourTo;
      guests += hourGuests;
    }
    // Останній запис за датою перекриває попередній (на випадок дублів).
    index.set(date, { to, guests, hours });
  }
  return index;
};

// Останні до `limit` дат того самого дня тижня, що передують `cutoffIso`, з фактом > 0.
const recentSameWeekdayDates = (index, weekday, cutoffIso, limit, metric) => {
  const dates = [];
  for (const [date, rec] of index.entries()) {
    if (date >= cutoffIso) continue;
    if (weekdayOf(date) !== weekday) continue;
    if ((metric === "guests" ? rec.guests : rec.to) > 0) dates.push(date);
  }
  dates.sort((a, b) => (a < b ? 1 : -1)); // спадання (найсвіжіші перші)
  return dates.slice(0, limit);
};

const average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// Погодинний профіль (частки за годинами, сума = 1) для дня тижня.
// Усереднює частку кожної години по недавніх днях того самого дня тижня.
const hourProfileForWeekday = (index, weekday, cutoffIso, limit, metric) => {
  const dates = recentSameWeekdayDates(index, weekday, cutoffIso, limit, metric);
  return hourProfileFromDates(index, dates, metric);
};

const hourProfileFromDates = (index, dates, metric) => {
  const acc = {};
  let count = 0;
  for (const date of dates) {
    const rec = index.get(date);
    const dayTotal = metric === "guests" ? rec.guests : rec.to;
    if (!(dayTotal > 0)) continue;
    for (const [hour, row] of Object.entries(rec.hours)) {
      const value = metric === "guests" ? row.guests : row.to;
      acc[hour] = (acc[hour] || 0) + value / dayTotal;
    }
    count += 1;
  }
  if (count === 0) return null;
  const profile = {};
  let sum = 0;
  for (const [hour, v] of Object.entries(acc)) {
    profile[hour] = v / count;
    sum += profile[hour];
  }
  if (sum <= 0) return null;
  for (const hour of Object.keys(profile)) profile[hour] /= sum;
  return profile;
};

// Загальний погодинний профіль по всій історії (фолбек).
const overallHourProfile = (index, metric) => hourProfileFromDates(index, [...index.keys()], metric);

const RECENT_FOR_WEIGHT = 4; // останні 4 входження дня тижня
const RECENT_FOR_PROFILE = 8; // ширша вибірка для стабільного погодинного профілю
const WEIGHT_WEEKDAY = 0.7; // вага недавнього дня тижня
const WEIGHT_LASTYEAR = 0.3; // вага «цей день рік тому»

// Історична «типова» величина дня (для метрики to/guests) з урахуванням
// недавнього дня тижня та того самого дня рік тому.
const historicalDayValue = (index, isoDate, cutoffIso, metric) => {
  const weekday = weekdayOf(isoDate);
  const recentDates = recentSameWeekdayDates(index, weekday, cutoffIso, RECENT_FOR_WEIGHT, metric);
  const recentAvg = average(recentDates.map((d) => (metric === "guests" ? index.get(d).guests : index.get(d).to)));

  const [y, m, d] = isoDate.split("-").map(Number);
  const lastYearIso = isoOf(y - 1, m, d);
  const lastYearRec = index.get(lastYearIso);
  const lastYearVal = lastYearRec ? (metric === "guests" ? lastYearRec.guests : lastYearRec.to) : 0;

  if (recentAvg > 0 && lastYearVal > 0) return WEIGHT_WEEKDAY * recentAvg + WEIGHT_LASTYEAR * lastYearVal;
  if (recentAvg > 0) return recentAvg;
  if (lastYearVal > 0) return lastYearVal;
  return null; // немає історії — заповнимо фолбеком нижче
};

/**
 * Будує місячний план: розкладає монтхлі ТО/Гості по днях і годинах.
 *
 * @param {Object} p
 * @param {number} p.year
 * @param {number} p.month           1-12
 * @param {number} p.monthlyTo       план ТО на місяць
 * @param {number} p.monthlyGuests   план Гості на місяць
 * @param {Array}  p.history         записи { date, hours:{ 'HH:00:00': { factTo, factGosti } } }
 * @param {(iso:string)=>string[]} p.getHoursForDate  робочі години дня (за графіком закладу)
 * @param {string} [p.cutoffIso]     дати історії ДО цієї (типово 1-ше число місяця)
 * @returns {{ days: Array<{date, weekday, hours: Record<string,{planTo:number, planGosti:number}>}>,
 *            totals: { to:number, guests:number }, meta: { historyDays:number, hasHistory:boolean } }}
 */
export const buildMonthlyPlan = ({
  year,
  month,
  monthlyTo,
  monthlyGuests,
  history,
  getHoursForDate,
  cutoffIso,
}) => {
  const index = buildHistoryIndex(history);
  const cutoff = cutoffIso || isoOf(year, month, 1);
  const totalDays = daysInMonth(year, month);

  const dates = [];
  for (let d = 1; d <= totalDays; d++) dates.push(isoOf(year, month, d));

  // --- Ваги днів ---
  const rawWeightsTo = dates.map((iso) => historicalDayValue(index, iso, cutoff, "to"));
  const rawWeightsGuests = dates.map((iso) => historicalDayValue(index, iso, cutoff, "guests"));

  // Фолбек для днів без історії: середнє серед відомих того самого дня тижня,
  // інакше — середнє серед усіх відомих, інакше — 1 (рівномірно).
  const fillWeights = (weights) => {
    const knownByWeekday = new Map();
    const allKnown = [];
    weights.forEach((w, i) => {
      if (w != null && w > 0) {
        allKnown.push(w);
        const wd = weekdayOf(dates[i]);
        if (!knownByWeekday.has(wd)) knownByWeekday.set(wd, []);
        knownByWeekday.get(wd).push(w);
      }
    });
    const allAvg = average(allKnown);
    return weights.map((w, i) => {
      if (w != null && w > 0) return w;
      const wd = weekdayOf(dates[i]);
      const wdVals = knownByWeekday.get(wd);
      if (wdVals && wdVals.length) return average(wdVals);
      if (allAvg > 0) return allAvg;
      return 1;
    });
  };

  const weightsTo = fillWeights(rawWeightsTo);
  const weightsGuests = fillWeights(rawWeightsGuests);

  // --- Розподіл місячного тоталу по днях (цілі числа з точною сумою) ---
  const dayTo = largestRemainderDistribute(weightsTo, monthlyTo);
  const dayGuests = largestRemainderDistribute(weightsGuests, monthlyGuests);

  // Профілі годин за днями тижня (кеш), з фолбеком на загальний профіль.
  const profileCache = new Map();
  const getProfile = (weekday, metric) => {
    const key = `${weekday}:${metric}`;
    if (profileCache.has(key)) return profileCache.get(key);
    const profile =
      hourProfileForWeekday(index, weekday, cutoff, RECENT_FOR_PROFILE, metric) ||
      overallHourProfile(index, metric);
    profileCache.set(key, profile);
    return profile;
  };

  const days = dates.map((iso, i) => {
    const weekday = weekdayOf(iso);
    const hoursList = (getHoursForDate ? getHoursForDate(iso) : []) || [];
    const profileTo = getProfile(weekday, "to");
    const profileGuests = getProfile(weekday, "guests");

    const weightsHourTo = hoursList.map((h) => (profileTo ? (profileTo[h] || 0) : 0));
    const weightsHourGuests = hoursList.map((h) => (profileGuests ? (profileGuests[h] || 0) : 0));

    const hourTo = largestRemainderDistribute(weightsHourTo, dayTo[i]);
    const hourGuests = largestRemainderDistribute(weightsHourGuests, dayGuests[i]);

    const hours = {};
    hoursList.forEach((h, hi) => {
      hours[h] = { planTo: hourTo[hi], planGosti: hourGuests[hi] };
    });

    return { date: iso, weekday, hours };
  });

  return {
    days,
    totals: {
      to: dayTo.reduce((a, b) => a + b, 0),
      guests: dayGuests.reduce((a, b) => a + b, 0),
    },
    meta: { historyDays: index.size, hasHistory: index.size > 0 },
  };
};
