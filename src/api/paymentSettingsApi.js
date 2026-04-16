import {
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "./collectionsApi.js";

export const isPaymentSettingsApiEnabled = isCollectionsApiEnabled;

// ─── Payers ───
const PAYERS = "paymentPayers";
export const getPayersApi = () => listCollectionItemsApi(PAYERS);
export const addPayerApi = (data) => createCollectionItemApi(PAYERS, data);
export const updatePayerApi = (id, data) => updateCollectionItemApi(PAYERS, id, data);
export const deletePayerApi = (id) => deleteCollectionItemApi(PAYERS, id);

// ─── Counterparties ───
const COUNTERPARTIES = "paymentCounterparties";
export const getCounterpartiesApi = () => listCollectionItemsApi(COUNTERPARTIES);
export const addCounterpartyApi = (data) => createCollectionItemApi(COUNTERPARTIES, data);
export const updateCounterpartyApi = (id, data) => updateCollectionItemApi(COUNTERPARTIES, id, data);
export const deleteCounterpartyApi = (id) => deleteCollectionItemApi(COUNTERPARTIES, id);

// ─── Approval routes ───
const ROUTES = "paymentApprovalRoutes";
export const getApprovalRoutesApi = () => listCollectionItemsApi(ROUTES);
export const addApprovalRouteApi = (data) => createCollectionItemApi(ROUTES, data);
export const updateApprovalRouteApi = (id, data) => updateCollectionItemApi(ROUTES, id, data);
export const deleteApprovalRouteApi = (id) => deleteCollectionItemApi(ROUTES, id);

// ─── Typical fields (single settings record) ───
const TYPICAL = "paymentTypicalFields";
export const getTypicalFieldsApi = () => listCollectionItemsApi(TYPICAL);
export const saveTypicalFieldsApi = (id, data) =>
  id ? updateCollectionItemApi(TYPICAL, id, data) : createCollectionItemApi(TYPICAL, data);
