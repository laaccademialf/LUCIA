import {
  listCollectionItemsApi,
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
} from "../api/collectionsApi";

/* ─── collection names ─── */
const COL_ITEMS = "assortmentMatrixItems";
const COL_TYPICAL = "assortmentMatrixTypicalFields";
const COL_SPECS = "assortmentMatrixSpecifications";

/* ─── helpers ─── */
const stamp = () => new Date().toISOString();

const wrapList = async (col) => {
  const items = await listCollectionItemsApi(col);
  return Array.isArray(items) ? items : [];
};

/* ═══════════════  MATRIX ITEMS  ═══════════════ */

export const getAssortmentMatrixItems = () => wrapList(COL_ITEMS);

export const addAssortmentMatrixItem = async (item) => {
  const id = await createCollectionItemApi(COL_ITEMS, {
    ...item,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  return id;
};

export const updateAssortmentMatrixItem = async (id, data) => {
  const { id: _ignore, ...rest } = data || {};
  await updateCollectionItemApi(COL_ITEMS, id, {
    ...rest,
    updatedAt: stamp(),
  });
};

export const deleteAssortmentMatrixItem = async (id) => {
  await deleteCollectionItemApi(COL_ITEMS, id);
};

/* ═══════════════  TYPICAL FIELDS  ═══════════════ */

export const getAssortmentTypicalFields = () => wrapList(COL_TYPICAL);

export const addAssortmentTypicalField = async (field) => {
  const id = await createCollectionItemApi(COL_TYPICAL, {
    ...field,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  return id;
};

export const updateAssortmentTypicalField = async (id, data) => {
  const { id: _ignore, ...rest } = data || {};
  await updateCollectionItemApi(COL_TYPICAL, id, {
    ...rest,
    updatedAt: stamp(),
  });
};

export const deleteAssortmentTypicalField = async (id) => {
  await deleteCollectionItemApi(COL_TYPICAL, id);
};

/* ═══════════════  SPECIFICATIONS  ═══════════════ */

export const getAssortmentSpecifications = () => wrapList(COL_SPECS);

export const addAssortmentSpecification = async (spec) => {
  const id = await createCollectionItemApi(COL_SPECS, {
    ...spec,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  return id;
};

export const updateAssortmentSpecification = async (id, data) => {
  const { id: _ignore, ...rest } = data || {};
  await updateCollectionItemApi(COL_SPECS, id, {
    ...rest,
    updatedAt: stamp(),
  });
};

export const deleteAssortmentSpecification = async (id) => {
  await deleteCollectionItemApi(COL_SPECS, id);
};
