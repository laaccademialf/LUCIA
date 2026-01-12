import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./config";

// ==================== КАТЕГОРІЇ ====================
export const getCategories = async () => {
  try {
    const q = query(collection(db, "assetCategories"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання категорій:", error);
    throw error;
  }
};

export const addCategory = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetCategories"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання категорії:", error);
    throw error;
  }
};

export const deleteCategory = async (id) => {
  try {
    await deleteDoc(doc(db, "assetCategories", id));
  } catch (error) {
    console.error("Помилка видалення категорії:", error);
    throw error;
  }
};

// ==================== ПІДКАТЕГОРІЇ ====================
export const getSubcategories = async () => {
  try {
    const q = query(collection(db, "assetSubcategories"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання підкатегорій:", error);
    throw error;
  }
};

export const addSubcategory = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetSubcategories"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання підкатегорії:", error);
    throw error;
  }
};

export const deleteSubcategory = async (id) => {
  try {
    await deleteDoc(doc(db, "assetSubcategories", id));
  } catch (error) {
    console.error("Помилка видалення підкатегорії:", error);
    throw error;
  }
};

// ==================== ТИПИ ОБЛІКУ ====================
export const getAccountingTypes = async () => {
  try {
    const q = query(collection(db, "assetAccountingTypes"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання типів обліку:", error);
    throw error;
  }
};

export const addAccountingType = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetAccountingTypes"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання типу обліку:", error);
    throw error;
  }
};

export const deleteAccountingType = async (id) => {
  try {
    await deleteDoc(doc(db, "assetAccountingTypes", id));
  } catch (error) {
    console.error("Помилка видалення типу обліку:", error);
    throw error;
  }
};

// ==================== БІЗНЕС НАПРЯМИ ====================
export const getBusinessUnits = async () => {
  try {
    const q = query(collection(db, "assetBusinessUnits"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання бізнес напрямів:", error);
    throw error;
  }
};

export const addBusinessUnit = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetBusinessUnits"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання бізнес напряму:", error);
    throw error;
  }
};

export const deleteBusinessUnit = async (id) => {
  try {
    await deleteDoc(doc(db, "assetBusinessUnits", id));
  } catch (error) {
    console.error("Помилка видалення бізнес напряму:", error);
    throw error;
  }
};

// ==================== СТАТУСИ ====================
export const getStatuses = async () => {
  try {
    const q = query(collection(db, "assetStatuses"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання статусів:", error);
    throw error;
  }
};

export const addStatus = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetStatuses"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання статусу:", error);
    throw error;
  }
};

export const deleteStatus = async (id) => {
  try {
    await deleteDoc(doc(db, "assetStatuses", id));
  } catch (error) {
    console.error("Помилка видалення статусу:", error);
    throw error;
  }
};

// ==================== СТАН ====================
export const getConditions = async () => {
  try {
    const q = query(collection(db, "assetConditions"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання станів:", error);
    throw error;
  }
};

export const addCondition = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetConditions"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання стану:", error);
    throw error;
  }
};

export const deleteCondition = async (id) => {
  try {
    await deleteDoc(doc(db, "assetConditions", id));
  } catch (error) {
    console.error("Помилка видалення стану:", error);
    throw error;
  }
};

// ==================== РІШЕННЯ ====================
export const getDecisions = async () => {
  try {
    const q = query(collection(db, "assetDecisions"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання рішень:", error);
    throw error;
  }
};

export const addDecision = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetDecisions"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання рішення:", error);
    throw error;
  }
};

export const deleteDecision = async (id) => {
  try {
    await deleteDoc(doc(db, "assetDecisions", id));
  } catch (error) {
    console.error("Помилка видалення рішення:", error);
    throw error;
  }
};

// ==================== ЗОНИ РОЗМІЩЕННЯ ====================
export const getPlacementZones = async () => {
  try {
    const q = query(collection(db, "assetPlacementZones"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання зон розміщення:", error);
    throw error;
  }
};

export const addPlacementZone = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetPlacementZones"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання зони розміщення:", error);
    throw error;
  }
};

export const deletePlacementZone = async (id) => {
  try {
    await deleteDoc(doc(db, "assetPlacementZones", id));
  } catch (error) {
    console.error("Помилка видалення зони розміщення:", error);
    throw error;
  }
};

// ==================== ЦЕНТРИ ВІДПОВІДАЛЬНОСТІ ====================
export const getResponsibilityCenters = async () => {
  try {
    const q = query(collection(db, "assetResponsibilityCenters"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання центрів відповідальності:", error);
    throw error;
  }
};

export const addResponsibilityCenter = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetResponsibilityCenters"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання центру відповідальності:", error);
    throw error;
  }
};

export const deleteResponsibilityCenter = async (id) => {
  try {
    await deleteDoc(doc(db, "assetResponsibilityCenters", id));
  } catch (error) {
    console.error("Помилка видалення центру відповідальності:", error);
    throw error;
  }
};

// ==================== МАТЕРІАЛЬНО ВІДПОВІДАЛЬНІ ОСОБИ ====================
export const getResponsiblePersons = async () => {
  try {
    const q = query(collection(db, "assetResponsiblePersons"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання матеріально відповідальних осіб:", error);
    throw error;
  }
};

export const addResponsiblePerson = async (name, centerId) => {
  try {
    const docRef = await addDoc(collection(db, "assetResponsiblePersons"), {
      name,
      centerId,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name, centerId };
  } catch (error) {
    console.error("Помилка додавання матеріально відповідальної особи:", error);
    throw error;
  }
};

export const deleteResponsiblePerson = async (id) => {
  try {
    await deleteDoc(doc(db, "assetResponsiblePersons", id));
  } catch (error) {
    console.error("Помилка видалення матеріально відповідальної особи:", error);
    throw error;
  }
};

// ==================== ПРАЦЕЗДАТНІСТЬ ====================
export const getFunctionalities = async () => {
  try {
    const q = query(collection(db, "assetFunctionalities"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання працездатностей:", error);
    throw error;
  }
};

export const addFunctionality = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetFunctionalities"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання працездатності:", error);
    throw error;
  }
};

export const deleteFunctionality = async (id) => {
  try {
    await deleteDoc(doc(db, "assetFunctionalities", id));
  } catch (error) {
    console.error("Помилка видалення працездатності:", error);
    throw error;
  }
};

// ==================== МОРАЛЬНА АКТУАЛЬНІСТЬ ====================
export const getRelevances = async () => {
  try {
    const q = query(collection(db, "assetRelevances"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання моральних актуальностей:", error);
    throw error;
  }
};

export const addRelevance = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetRelevances"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання моральної актуальності:", error);
    throw error;
  }
};

export const deleteRelevance = async (id) => {
  try {
    await deleteDoc(doc(db, "assetRelevances", id));
  } catch (error) {
    console.error("Помилка видалення моральної актуальності:", error);
    throw error;
  }
};

// ==================== ПРИЧИНИ ====================
export const getReasons = async () => {
  try {
    const q = query(collection(db, "assetReasons"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Помилка отримання причин:", error);
    throw error;
  }
};

export const addReason = async (name) => {
  try {
    const docRef = await addDoc(collection(db, "assetReasons"), {
      name,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, name };
  } catch (error) {
    console.error("Помилка додавання причини:", error);
    throw error;
  }
};

export const deleteReason = async (id) => {
  try {
    await deleteDoc(doc(db, "assetReasons", id));
  } catch (error) {
    console.error("Помилка видалення причини:", error);
    throw error;
  }
};
