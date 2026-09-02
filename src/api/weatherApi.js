// Погодний клієнт для Києва на базі Open-Meteo (безкоштовно, без API-ключа, з CORS).
// Використовується для формування коректнішої розбивки плану ТО з урахуванням прогнозу.

const KYIV_LAT = 50.4501;
const KYIV_LON = 30.5234;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather code → короткий опис українською.
const WEATHER_CODE_UK = {
  0: "Ясно",
  1: "Переважно ясно",
  2: "Мінлива хмарність",
  3: "Хмарно",
  45: "Туман",
  48: "Паморозь",
  51: "Мряка",
  53: "Мряка",
  55: "Сильна мряка",
  56: "Крижана мряка",
  57: "Крижана мряка",
  61: "Невеликий дощ",
  63: "Дощ",
  65: "Сильний дощ",
  66: "Крижаний дощ",
  67: "Крижаний дощ",
  71: "Невеликий сніг",
  73: "Сніг",
  75: "Сильний сніг",
  77: "Сніжна крупа",
  80: "Короткочасний дощ",
  81: "Зливи",
  82: "Сильні зливи",
  85: "Снігопад",
  86: "Сильний снігопад",
  95: "Гроза",
  96: "Гроза з градом",
  99: "Сильна гроза з градом",
};

const describeCode = (code) => WEATHER_CODE_UK[code] || "—";

// Множник впливу погоди на ТО ресторану (евристика для Києва).
// База за типом погоди × поправка за температурою, з обмеженням діапазону.
const weatherFactor = (code, tempMax) => {
  let factor = 1;
  if (code === 0 || code === 1) factor = 1.06; // ясно/переважно ясно
  else if (code === 2) factor = 1.03; // мінлива хмарність
  else if (code === 3) factor = 1.0; // хмарно
  else if (code === 45 || code === 48) factor = 0.97; // туман
  else if (code >= 51 && code <= 57) factor = 0.95; // мряка
  else if (code >= 61 && code <= 67) factor = 0.92; // дощ
  else if (code >= 71 && code <= 77) factor = 0.9; // сніг
  else if (code >= 80 && code <= 82) factor = 0.9; // зливи
  else if (code >= 85 && code <= 86) factor = 0.88; // снігопад
  else if (code >= 95) factor = 0.85; // гроза

  const t = Number(tempMax);
  if (Number.isFinite(t)) {
    if (t >= 12 && t <= 26) factor *= 1.03; // комфортна температура — тераси, трафік
    else if (t > 30 || t < -5) factor *= 0.95; // спека / сильний мороз
  }

  return Math.max(0.85, Math.min(1.12, factor));
};

const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Обмежує діапазон дат до вікна, яке віддає Open-Meteo forecast (≈ -92..+16 днів).
const clampRange = (startIso, endIso) => {
  const today = new Date();
  const minDate = addDays(today, -92);
  const maxDate = addDays(today, 16);
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const s = start < minDate ? minDate : start;
  const e = end > maxDate ? maxDate : end;
  if (s > e) return null;
  return { start: isoOf(s), end: isoOf(e) };
};

/**
 * Прогноз погоди для Києва на діапазон дат.
 * @returns {Promise<Record<string, { code:number, description:string, tempMax:number, tempMin:number, precipitation:number, factor:number }>>}
 * Ключ — ISO-дата. Дні поза горизонтом прогнозу відсутні (для них множник = 1).
 */
export const fetchKyivWeather = async ({ startDate, endDate, signal } = {}) => {
  const range = clampRange(startDate, endDate);
  if (!range) return {};

  const qs = new URLSearchParams({
    latitude: String(KYIV_LAT),
    longitude: String(KYIV_LON),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "Europe/Kyiv",
    start_date: range.start,
    end_date: range.end,
  });

  const res = await fetch(`${FORECAST_URL}?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error(`Погодний сервіс недоступний (HTTP ${res.status})`);
  const json = await res.json();
  const daily = json?.daily;
  if (!daily || !Array.isArray(daily.time)) return {};

  const out = {};
  daily.time.forEach((date, i) => {
    const code = Number(daily.weather_code?.[i]);
    const tempMax = Number(daily.temperature_2m_max?.[i]);
    const tempMin = Number(daily.temperature_2m_min?.[i]);
    const precipitation = Number(daily.precipitation_sum?.[i]) || 0;
    out[date] = {
      code,
      description: describeCode(code),
      tempMax,
      tempMin,
      precipitation,
      factor: weatherFactor(code, tempMax),
    };
  });
  return out;
};

// Короткий підпис для колонки «Погода», напр. "Ясно, 18°".
export const weatherLabel = (info) => {
  if (!info) return "";
  const t = Number.isFinite(info.tempMax) ? `, ${Math.round(info.tempMax)}°` : "";
  return `${info.description}${t}`;
};
