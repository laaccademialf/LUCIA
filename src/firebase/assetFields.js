import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "./collectionsAdapter";

const byNameAsc = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "uk");

const listNamedItems = async (collectionName, errorLabel) => {
  if (isApiDataModeEnabled()) {
    const items = await listCollectionItemsApi(collectionName);
    return items.sort(byNameAsc);
  }

  try {
    const q = query(collection(db, collectionName), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error(errorLabel, error);
    throw error;
  }
};

const addNamedItem = async (collectionName, name, errorLabel, extraPayload = {}) => {
  const payload = {
    name,
    ...extraPayload,
    createdAt: new Date().toISOString(),
  };

  if (isApiDataModeEnabled()) {
    const id = await createCollectionItemApi(collectionName, payload);
    return { id, ...payload };
  }

  try {
    const docRef = await addDoc(collection(db, collectionName), payload);
    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error(errorLabel, error);
    throw error;
  }
};

const updateNamedItem = async (collectionName, id, payload, errorLabel) => {
  const next = {
    ...(payload || {}),
    updatedAt: new Date().toISOString(),
  };

  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi(collectionName, id, next);
    return;
  }

  try {
    await updateDoc(doc(db, collectionName, id), next);
  } catch (error) {
    console.error(errorLabel, error);
    throw error;
  }
};

const deleteItem = async (collectionName, id, errorLabel) => {
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi(collectionName, id);
    return;
  }

  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(errorLabel, error);
    throw error;
  }
};

// ==================== КАТЕГОРІЇ ====================
export const getCategories = async () => listNamedItems("assetCategories", "Помилка отримання категорій:");
export const addCategory = async (name) => addNamedItem("assetCategories", name, "Помилка додавання категорії:");
export const deleteCategory = async (id) => deleteItem("assetCategories", id, "Помилка видалення категорії:");
export const updateCategory = async (id, name) =>
  updateNamedItem("assetCategories", id, { name }, "Помилка редагування категорії:");

// ==================== ПІДКАТЕГОРІЇ ====================
export const getSubcategories = async () =>
  listNamedItems("assetSubcategories", "Помилка отримання підкатегорій:");
export const addSubcategory = async (name, categoryId = "", categoryName = "") =>
  addNamedItem("assetSubcategories", name, "Помилка додавання підкатегорії:", { categoryId, categoryName });
export const deleteSubcategory = async (id) =>
  deleteItem("assetSubcategories", id, "Помилка видалення підкатегорії:");
export const updateSubcategory = async (id, name, categoryId = "", categoryName = "") =>
  updateNamedItem(
    "assetSubcategories",
    id,
    { name, categoryId, categoryName },
    "Помилка редагування підкатегорії:"
  );

// ==================== ТИПИ ОБЛІКУ ====================
export const getAccountingTypes = async () =>
  listNamedItems("assetAccountingTypes", "Помилка отримання типів обліку:");
export const addAccountingType = async (name) =>
  addNamedItem("assetAccountingTypes", name, "Помилка додавання типу обліку:");
export const deleteAccountingType = async (id) =>
  deleteItem("assetAccountingTypes", id, "Помилка видалення типу обліку:");
export const updateAccountingType = async (id, name) =>
  updateNamedItem("assetAccountingTypes", id, { name }, "Помилка редагування типу обліку:");

// ==================== БІЗНЕС НАПРЯМИ ====================
export const getBusinessUnits = async () =>
  listNamedItems("assetBusinessUnits", "Помилка отримання бізнес напрямів:");
export const addBusinessUnit = async (name) =>
  addNamedItem("assetBusinessUnits", name, "Помилка додавання бізнес напряму:");
export const deleteBusinessUnit = async (id) =>
  deleteItem("assetBusinessUnits", id, "Помилка видалення бізнес напряму:");
export const updateBusinessUnit = async (id, name) =>
  updateNamedItem("assetBusinessUnits", id, { name }, "Помилка редагування бізнес напряму:");

// ==================== СТАТУСИ ====================
export const getStatuses = async () => listNamedItems("assetStatuses", "Помилка отримання статусів:");
export const addStatus = async (name) => addNamedItem("assetStatuses", name, "Помилка додавання статусу:");
export const deleteStatus = async (id) => deleteItem("assetStatuses", id, "Помилка видалення статусу:");
export const updateStatus = async (id, name) =>
  updateNamedItem("assetStatuses", id, { name }, "Помилка редагування статусу:");

// ==================== СТАН ====================
export const getConditions = async () => listNamedItems("assetConditions", "Помилка отримання станів:");
export const addCondition = async (name) => addNamedItem("assetConditions", name, "Помилка додавання стану:");
export const deleteCondition = async (id) => deleteItem("assetConditions", id, "Помилка видалення стану:");
export const updateCondition = async (id, name) =>
  updateNamedItem("assetConditions", id, { name }, "Помилка редагування стану:");

// ==================== РІШЕННЯ ====================
export const getDecisions = async () => listNamedItems("assetDecisions", "Помилка отримання рішень:");
export const addDecision = async (name) => addNamedItem("assetDecisions", name, "Помилка додавання рішення:");
export const deleteDecision = async (id) => deleteItem("assetDecisions", id, "Помилка видалення рішення:");
export const updateDecision = async (id, name) =>
  updateNamedItem("assetDecisions", id, { name }, "Помилка редагування рішення:");

// ==================== ЗОНИ РОЗМІЩЕННЯ ====================
export const getPlacementZones = async () =>
  listNamedItems("assetPlacementZones", "Помилка отримання зон розміщення:");
export const addPlacementZone = async (name) =>
  addNamedItem("assetPlacementZones", name, "Помилка додавання зони розміщення:");
export const deletePlacementZone = async (id) =>
  deleteItem("assetPlacementZones", id, "Помилка видалення зони розміщення:");
export const updatePlacementZone = async (id, name) =>
  updateNamedItem("assetPlacementZones", id, { name }, "Помилка редагування зони розміщення:");

// ==================== ЦЕНТРИ ВІДПОВІДАЛЬНОСТІ ====================
export const getResponsibilityCenters = async () =>
  listNamedItems("assetResponsibilityCenters", "Помилка отримання центрів відповідальності:");
export const addResponsibilityCenter = async (name) =>
  addNamedItem("assetResponsibilityCenters", name, "Помилка додавання центру відповідальності:");
export const deleteResponsibilityCenter = async (id) =>
  deleteItem("assetResponsibilityCenters", id, "Помилка видалення центру відповідальності:");

// ==================== МАТЕРІАЛЬНО ВІДПОВІДАЛЬНІ ОСОБИ ====================
export const getResponsiblePersons = async () =>
  listNamedItems("assetResponsiblePersons", "Помилка отримання матеріально відповідальних осіб:");
export const addResponsiblePerson = async (name, centerId) =>
  addNamedItem("assetResponsiblePersons", name, "Помилка додавання матеріально відповідальної особи:", {
    centerId,
  });
export const deleteResponsiblePerson = async (id) =>
  deleteItem("assetResponsiblePersons", id, "Помилка видалення матеріально відповідальної особи:");

// ==================== ПРАЦЕЗДАТНІСТЬ ====================
export const getFunctionalities = async () =>
  listNamedItems("assetFunctionalities", "Помилка отримання працездатностей:");
export const addFunctionality = async (name) =>
  addNamedItem("assetFunctionalities", name, "Помилка додавання працездатності:");
export const deleteFunctionality = async (id) =>
  deleteItem("assetFunctionalities", id, "Помилка видалення працездатності:");
export const updateFunctionality = async (id, name) =>
  updateNamedItem("assetFunctionalities", id, { name }, "Помилка редагування працездатності:");

// ==================== МОРАЛЬНА АКТУАЛЬНІСТЬ ====================
export const getRelevances = async () =>
  listNamedItems("assetRelevances", "Помилка отримання моральних актуальностей:");
export const addRelevance = async (name) =>
  addNamedItem("assetRelevances", name, "Помилка додавання моральної актуальності:");
export const deleteRelevance = async (id) =>
  deleteItem("assetRelevances", id, "Помилка видалення моральної актуальності:");
export const updateRelevance = async (id, name) =>
  updateNamedItem("assetRelevances", id, { name }, "Помилка редагування моральної актуальності:");

// ==================== ПРИЧИНИ ====================
export const getReasons = async () => listNamedItems("assetReasons", "Помилка отримання причин:");
export const addReason = async (name) => addNamedItem("assetReasons", name, "Помилка додавання причини:");
export const deleteReason = async (id) => deleteItem("assetReasons", id, "Помилка видалення причини:");
export const updateReason = async (id, name) =>
  updateNamedItem("assetReasons", id, { name }, "Помилка редагування причини:");
