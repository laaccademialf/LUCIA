import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "./config";

// Додати новий лічильник
export async function addUtilityMeter({ restaurantId, utilityType, number, price }) {
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
  const ref = doc(db, "utilityMeters", id);
  await updateDoc(ref, { price });
}

// Видалити лічильник
export async function deleteUtilityMeter(id) {
  const ref = doc(db, "utilityMeters", id);
  await deleteDoc(ref);
}

// Отримати всі лічильники для ресторану та утиліти
export async function getUtilityMeters(restaurantId, utilityType) {
  const ref = collection(db, "utilityMeters");
  const q = query(ref, where("restaurantId", "==", restaurantId), where("utilityType", "==", utilityType));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
