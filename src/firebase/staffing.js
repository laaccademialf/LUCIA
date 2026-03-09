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
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  subscribeByPolling,
  updateCollectionItemApi,
  upsertCollectionItemById,
} from "./collectionsAdapter";

const JOB_TITLES_COLLECTION = "teamJobTitles";
const STAFFING_PLANS_COLLECTION = "teamStaffingPlans";
const REQUESTS_COLLECTION = "teamRecruitmentRequests";
const EMPLOYEES_COLLECTION = "teamEmployees";
const SHIFT_EVENTS_COLLECTION = "teamShiftEvents";

export const subscribeToJobTitles = (callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(() => listCollectionItemsApi(JOB_TITLES_COLLECTION), callback, 5000);
  }

  const q = query(collection(db, JOB_TITLES_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addJobTitle = async (payload) => {
  if (isApiDataModeEnabled()) {
    const normalized = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const id = await createCollectionItemApi(JOB_TITLES_COLLECTION, normalized);
    return { id, ...normalized };
  }

  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, JOB_TITLES_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateJobTitle = async (id, payload) => {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi(JOB_TITLES_COLLECTION, id, {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await updateDoc(doc(db, JOB_TITLES_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteJobTitle = async (id) => {
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi(JOB_TITLES_COLLECTION, id);
    return;
  }

  await deleteDoc(doc(db, JOB_TITLES_COLLECTION, id));
};

export const subscribeToStaffingPlans = (callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(() => listCollectionItemsApi(STAFFING_PLANS_COLLECTION), callback, 5000);
  }

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

  if (isApiDataModeEnabled()) {
    await upsertCollectionItemById(STAFFING_PLANS_COLLECTION, docId, {
      ...payload,
      id: docId,
      restaurantId,
      month,
      jobTitleId,
      updatedAt: new Date().toISOString(),
    });
    return docId;
  }

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
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(() => listCollectionItemsApi(REQUESTS_COLLECTION), callback, 5000);
  }

  const q = query(collection(db, REQUESTS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addRecruitmentRequest = async (payload) => {
  if (isApiDataModeEnabled()) {
    const normalized = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const id = await createCollectionItemApi(REQUESTS_COLLECTION, normalized);
    return { id, ...normalized };
  }

  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, REQUESTS_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateRecruitmentRequest = async (id, payload) => {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi(REQUESTS_COLLECTION, id, {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await updateDoc(doc(db, REQUESTS_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeToTeamEmployees = (callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(() => listCollectionItemsApi(EMPLOYEES_COLLECTION), callback, 5000);
  }

  const q = query(collection(db, EMPLOYEES_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addTeamEmployee = async (payload) => {
  if (isApiDataModeEnabled()) {
    const normalized = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const id = await createCollectionItemApi(EMPLOYEES_COLLECTION, normalized);
    return { id, ...normalized };
  }

  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};

export const updateTeamEmployee = async (id, payload) => {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi(EMPLOYEES_COLLECTION, id, {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await updateDoc(doc(db, EMPLOYEES_COLLECTION, id), {
    ...payload,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeToTeamShiftEvents = (callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(() => listCollectionItemsApi(SHIFT_EVENTS_COLLECTION), callback, 5000);
  }

  const q = query(collection(db, SHIFT_EVENTS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};

export const addTeamShiftEvent = async (payload) => {
  if (isApiDataModeEnabled()) {
    const normalized = {
      ...payload,
      createdAt: new Date().toISOString(),
    };
    const id = await createCollectionItemApi(SHIFT_EVENTS_COLLECTION, normalized);
    return { id, ...normalized };
  }

  const normalized = {
    ...payload,
    createdAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, SHIFT_EVENTS_COLLECTION), normalized);
  return { id: docRef.id, ...normalized };
};
