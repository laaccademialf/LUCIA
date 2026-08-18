export const PAGINATION_OPTIONS = [10, 15, 20, 25];

export const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

export const paginateItems = (items, page, pageSize) => {
  const size = Number(pageSize) > 0 ? Number(pageSize) : PAGINATION_OPTIONS[0];
  const total = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), total);
  const startIndex = (safePage - 1) * size;

  return {
    currentPage: safePage,
    pageSize: size,
    totalPages: total,
    items: items.slice(startIndex, startIndex + size),
  };
};
