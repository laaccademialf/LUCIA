import { getDoc, setDoc, doc } from "firebase/firestore";
import { db } from "./config";

const MENU_DOC_ID = "main"; // можна змінити для мультиорганізаційності

export async function getMenuStructure() {
  const ref = doc(db, "menuStructure", MENU_DOC_ID);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().structure : [];
}

export async function saveMenuStructure(structure) {
  const ref = doc(db, "menuStructure", MENU_DOC_ID);
  await setDoc(ref, { structure });
}
