import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "./config";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isApiDataModeEnabled,
  listByField,
  updateCollectionItemApi,
} from "./collectionsAdapter";

// Додати новий лічильник
export async function addUtilityMeter({ restaurantId, utilityType, number, price }) {
  if (isApiDataModeEnabled()) {
    const payload = {
      restaurantId,
      utilityType,
      number,
      price,
      createdAt: new Date().toISOString(),
    };
    const id = await createCollectionItemApi("utilityMeters", payload);
    return { id, ...payload };
  }

  const ref = collection(db, "utilityMeters");
  const docRef = await addDoc(ref, {
    restaurantId,
    utilityType,
    number,
    price,
    createdAt: new Date().toISOString(),
  });
  return { id: docRef.id, restaurantId, utilityType, number, price, createdAt: new Date().toISOString() };
}

// Оновити ціну лічильника
export async function updateUtilityMeterPrice(id, price) {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi("utilityMeters", id, { price, updatedAt: new Date().toISOString() });
    return;
  }

  const ref = doc(db, "utilityMeters", id);
  await updateDoc(ref, { price });
}

// Видалити лічильник
export async function deleteUtilityMeter(id) {
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi("utilityMeters", id);
    return;
  }

  const ref = doc(db, "utilityMeters", id);
  await deleteDoc(ref);
}

// Отримати всі лічильники для ресторану та утиліти
export async function getUtilityMeters(restaurantId, utilityType) {
  if (isApiDataModeEnabled()) {
    const byRestaurant = await listByField("utilityMeters", "restaurantId", restaurantId);
    return byRestaurant.filter((item) => String(item?.utilityType || "") === String(utilityType || ""));
  }

  const ref = collection(db, "utilityMeters");
  const q = query(ref, where("restaurantId", "==", restaurantId), where("utilityType", "==", utilityType));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
