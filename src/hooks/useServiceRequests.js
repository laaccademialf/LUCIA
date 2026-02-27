import { useEffect, useState } from "react";
import {
  addServiceRequest,
  deleteServiceRequest,
  getServiceRequests,
  subscribeToServiceRequests,
  updateServiceRequest,
} from "../firebase/firestore";

export const useServiceRequests = (enableRealtime = true) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe;

    if (enableRealtime) {
      try {
        unsubscribe = subscribeToServiceRequests((data) => {
          setRequests(data);
          setLoading(false);
        });
      } catch (err) {
        console.error("Помилка підписки на сервісні заявки:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      const fetchData = async () => {
        try {
          const data = await getServiceRequests();
          setRequests(data);
        } catch (err) {
          console.error("Помилка завантаження сервісних заявок:", err);
          setError(err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [enableRealtime]);

  const createRequest = async (requestData) => {
    try {
      const id = await addServiceRequest(requestData);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateRequest = async (id, data) => {
    try {
      await updateServiceRequest(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeRequest = async (id) => {
    try {
      await deleteServiceRequest(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    requests,
    loading,
    error,
    createRequest,
    updateRequest,
    removeRequest,
  };
};
