// Чисті хелпери зіставлення записів за рестораном (за id / назвою / рег. номером).
// Використовуються для фільтрації видимості даних у межах ресторану користувача.
// НЕ містять залежностей від React.

// Нормалізує токен для порівняння: тримить + нижній регістр.
export const normalizeComparableToken = (value) => String(value || "").trim().toLowerCase();

// Чи збігаються два посилання на ресторан (за нормалізованим токеном).
export const sameRestaurant = (productRestaurantId, restaurantId) =>
  normalizeComparableToken(productRestaurantId) === normalizeComparableToken(restaurantId);

// Збирає множину всіх можливих ідентифікаторів ресторану з довільного запису.
export const collectRestaurantTokens = (source = {}) => {
  return new Set(
    [
      source?.restaurantId,
      source?.restaurant_id,
      source?.restaurant,
      source?.restaurantName,
      source?.restaurant_name,
      source?.restaurantRegNumber,
      source?.restaurant_reg_number,
      source?.regNumber,
      source?.reg_number,
      source?.id,
      source?.name,
      source?.code,
    ]
      .map((value) => normalizeComparableToken(value))
      .filter(Boolean)
  );
};

// Стабільний ключ ресторану (відсортовані токени через "::") для індексації.
export const buildRestaurantLookupKey = (source = {}) => {
  return Array.from(collectRestaurantTokens(source || {}))
    .sort((left, right) => left.localeCompare(right, "uk"))
    .join("::");
};

// Чи перетинаються дві множини токенів ресторану.
export const hasRestaurantTokenOverlap = (leftTokens, rightTokens) => {
  if (!(leftTokens instanceof Set) || !(rightTokens instanceof Set)) return false;
  if (!leftTokens.size || !rightTokens.size) return false;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) return true;
  }
  return false;
};

// Токени ресторану користувача, розширені даними зі знайденого запису ресторану,
// щоб можна було порівнювати за id/назвою/рег.номером взаємозамінно.
export const buildUserRestaurantTokens = (user, restaurants = []) => {
  const userTokens = collectRestaurantTokens(user || {});
  if (!userTokens.size) return userTokens;

  const matchedRestaurant = (Array.isArray(restaurants) ? restaurants : []).find((item) =>
    hasRestaurantTokenOverlap(userTokens, collectRestaurantTokens(item || {}))
  );

  if (matchedRestaurant) {
    for (const token of collectRestaurantTokens(matchedRestaurant)) {
      userTokens.add(token);
    }
  }

  return userTokens;
};

// Чи видима інвентаризація користувачу в межах його ресторану (адмін бачить усе).
export const isInventoryVisibleForUserRestaurant = (inventory, user, restaurants = [], isGlobalAdmin = false) => {
  if (isGlobalAdmin) return true;
  const scopedRestaurantTokens = new Set();
  for (const restaurant of Array.isArray(restaurants) ? restaurants : []) {
    for (const token of collectRestaurantTokens(restaurant || {})) {
      scopedRestaurantTokens.add(token);
    }
  }
  const userRestaurantTokens = scopedRestaurantTokens.size
    ? scopedRestaurantTokens
    : buildUserRestaurantTokens(user, restaurants);
  const inventoryTokens = collectRestaurantTokens(inventory || {});
  return hasRestaurantTokenOverlap(userRestaurantTokens, inventoryTokens);
};

// Знаходить ресторан за будь-яким із переданих посилань (id/код/назва/рег.номер).
export const findRestaurantByAnyReference = (restaurants = [], references = []) => {
  if (!Array.isArray(restaurants) || restaurants.length === 0) return null;

  const normalizedRefs = Array.from(new Set(references.map((value) => normalizeComparableToken(value)).filter(Boolean)));
  if (!normalizedRefs.length) return null;

  return restaurants.find((restaurant) => {
    const candidates = [
      restaurant?.id,
      restaurant?.code,
      restaurant?.regNumber,
      restaurant?.restaurantCode,
      restaurant?.name,
      restaurant?.restaurantName,
    ]
      .map((value) => normalizeComparableToken(value))
      .filter(Boolean);

    return candidates.some((candidate) => normalizedRefs.includes(candidate));
  }) || null;
};

// Доповнює запис канонічними полями ресторану зі знайденого довідкового запису.
export const normalizeRestaurantScopedRecord = (record, restaurants = []) => {
  if (!record || typeof record !== "object") return record;

  const recordRestaurantId = String(record.restaurantId || "").trim();
  const recordRestaurantName = String(record.restaurantName || "").trim();
  const recordRestaurantRegNumber = String(record.restaurantRegNumber || "").trim();

  const matchedRestaurant = findRestaurantByAnyReference(restaurants, [
    recordRestaurantId,
    recordRestaurantName,
    recordRestaurantRegNumber,
    record.restaurant,
    record.restaurant_id,
    record.restaurant_name,
    record.restaurant_reg_number,
    record.regNumber,
    record.reg_number,
  ]);

  if (!matchedRestaurant) return record;

  return {
    ...record,
    restaurantId: String(matchedRestaurant.id || recordRestaurantId || "").trim(),
    restaurantName: String(matchedRestaurant.name || recordRestaurantName || "").trim(),
    restaurantRegNumber: String(
      matchedRestaurant.regNumber ||
      recordRestaurantRegNumber ||
      matchedRestaurant.code ||
      matchedRestaurant.restaurantCode ||
      ""
    ).trim(),
  };
};

// Будує унікальний відсортований список ресторанів, виведений із записів даних.
export const buildDerivedRestaurants = (records = []) => {
  const restaurantMap = new Map();

  records.forEach((record) => {
    if (!record || typeof record !== "object") return;

    const id = String(
      record.restaurantId ||
      record.restaurant_id ||
      record.restaurantRegNumber ||
      record.restaurant_reg_number ||
      record.regNumber ||
      record.reg_number ||
      record.restaurantName ||
      record.restaurant_name ||
      record.restaurant ||
      ""
    ).trim();
    const name = String(record.restaurantName || record.restaurant_name || record.restaurant || "").trim();
    const regNumber = String(
      record.restaurantRegNumber || record.restaurant_reg_number || record.regNumber || record.reg_number || ""
    ).trim();

    if (!id && !name && !regNumber) return;

    const key = String(id || regNumber || name).trim().toLowerCase();
    if (!key) return;

    const existing = restaurantMap.get(key);
    if (existing) {
      restaurantMap.set(key, {
        ...existing,
        id: existing.id || id || regNumber || name,
        name: existing.name || name || regNumber || id,
        regNumber: existing.regNumber || regNumber,
      });
      return;
    }

    restaurantMap.set(key, {
      id: id || regNumber || name,
      name: name || regNumber || id,
      regNumber,
    });
  });

  return Array.from(restaurantMap.values()).sort((a, b) =>
    String(a?.name || a?.regNumber || a?.id || "").localeCompare(String(b?.name || b?.regNumber || b?.id || ""), "uk")
  );
};
