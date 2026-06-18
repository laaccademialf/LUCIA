// Чисті хелпери розбору полів злиття/завершення інвентаризацій.
// Підтримують обидва нейминги (camelCase і snake_case) та JSON-рядки.
// НЕ містять залежностей від React.

// Хто завершив сесію інвентаризації; "-" якщо невідомо.
export const getInventoryEndedByLabel = (inventory) => {
  const endedBy = String(
    inventory?.inventorySessionEndedBy ||
    inventory?.inventory_session_ended_by ||
    inventory?.sessionEndedBy ||
    ""
  ).trim();
  return endedBy || "-";
};

// Масив id документів, з яких злито інвентаризацію (масив / JSON / CSV-рядок).
export const getMergedFromIds = (inventory) => {
  const direct = inventory?.mergedFromIds ?? inventory?.merged_from_ids;
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

// Id документа, у який злито поточну інвентаризацію ("" якщо немає).
export const getMergedIntoId = (inventory) =>
  String(inventory?.mergedIntoId || inventory?.merged_into_id || "").trim();

// Масив документів-джерел зведення (масив / JSON-рядок).
export const getMergedSourceDocuments = (inventory) => {
  const direct = inventory?.mergedSourceDocuments ?? inventory?.merged_source_documents;
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
