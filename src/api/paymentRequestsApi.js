import {
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "./collectionsApi.js";

const COLLECTION = "paymentRequests";

export const isPaymentRequestsApiEnabled = isCollectionsApiEnabled;

export const getPaymentRequestsApi = async () => {
  return listCollectionItemsApi(COLLECTION);
};

export const addPaymentRequestApi = async (data) => {
  return createCollectionItemApi(COLLECTION, data);
};

export const updatePaymentRequestApi = async (id, data) => {
  return updateCollectionItemApi(COLLECTION, id, data);
};

export const deletePaymentRequestApi = async (id) => {
  return deleteCollectionItemApi(COLLECTION, id);
};
