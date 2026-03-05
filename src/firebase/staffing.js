import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config";

const JOB_TITLES_COLLECTION = "teamJobTitles";
const STAFFING_PLANS_COLLECTION = "teamStaffingPlans";
const REQUESTS_COLLECTION = "teamRecruitmentRequests";
const EMPLOYEES_COLLECTION = "teamEmployees";
const SHIFT_EVENTS_COLLECTION = "teamShiftEvents";

export const subscribeToJobTitles = (callback) => {
  const q = query(collection(db, JOB_TITLES_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addJobTitle = async (payload) => {
  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, JOB_TITLES_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateJobTitle = async (id, payload) => {
  await updateDoc(doc(db, JOB_TITLES_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteJobTitle = async (id) => {
  await deleteDoc(doc(db, JOB_TITLES_COLLECTION, id));
};

export const subscribeToStaffingPlans = (callback) => {
  const q = query(collection(db, STAFFING_PLANS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const upsertStaffingPlan = async (payload) => {
  const restaurantId = String(payload.restaurantId || "").trim();
  const month = String(payload.month || "").trim();
  const jobTitleId = String(payload.jobTitleId || "").trim();
  const docId = `${restaurantId}_${month}_${jobTitleId}`;

  await setDoc(
    doc(db, STAFFING_PLANS_COLLECTION, docId),
    {
      ...payload,
      id: docId,
      restaurantId,
      month,
      jobTitleId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return docId;
};

export const subscribeToRecruitmentRequests = (callback) => {
  const q = query(collection(db, REQUESTS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addRecruitmentRequest = async (payload) => {
  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, REQUESTS_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateRecruitmentRequest = async (id, payload) => {
  await updateDoc(doc(db, REQUESTS_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeToTeamEmployees = (callback) => {
  const q = query(collection(db, EMPLOYEES_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addTeamEmployee = async (payload) => {
  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateTeamEmployee = async (id, payload) => {
  await updateDoc(doc(db, EMPLOYEES_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeToTeamShiftEvents = (callback) => {
  const q = query(collection(db, SHIFT_EVENTS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addTeamShiftEvent = async (payload) => {
  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, SHIFT_EVENTS_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};
