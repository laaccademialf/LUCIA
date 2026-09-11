import { getCollectionItemApi } from "./collectionsApi.js";

// Місяць × 15 закладів — це до 465 документів. Не займаємо всі з'єднання
// браузера та припиняємо чергу, коли користувач уже змінив фільтр.
export const loadSalesPlanDays = async ({ restaurantIds, dates, signal }) => {
  const requests = restaurantIds.flatMap((restaurantId) => dates.map((date) => `${restaurantId}__${date}`));
  const result = {};
  let next = 0;
  let failed = false;
  let completed = 0;
  const checkAborted = () => {
    if (signal?.aborted) throw new DOMException("Завантаження скасовано", "AbortError");
  };
  const worker = async () => {
    try {
      while (!failed && next < requests.length) {
        checkAborted();
        const id = requests[next++];
        const doc = await getCollectionItemApi("salesHourlyPlans", id);
        checkAborted();
        result[id] = doc?.hours || {};
        completed += 1;
        // Кешовані відповіді теж віддають керування браузеру між порціями.
        if (completed % 24 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      failed = true;
      throw error;
    }
  };
  checkAborted();
  await Promise.all(Array.from({ length: Math.min(6, requests.length) }, worker));
  checkAborted();
  return result;
};
