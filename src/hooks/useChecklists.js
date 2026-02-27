import { useEffect, useState } from "react";
import {
  addChecklistExecution,
  addChecklistTemplate,
  deleteChecklistExecution,
  deleteChecklistTemplate,
  getChecklistExecutions,
  getChecklistTemplates,
  subscribeToChecklistExecutions,
  subscribeToChecklistTemplates,
  updateChecklistExecution,
  updateChecklistTemplate,
} from "../firebase/firestore";

export const useChecklists = (enableRealtime = true) => {
  const [templates, setTemplates] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribeTemplates;
    let unsubscribeExecutions;

    if (enableRealtime) {
      try {
        unsubscribeTemplates = subscribeToChecklistTemplates((data) => {
          setTemplates(data);
          setLoading(false);
        });

        unsubscribeExecutions = subscribeToChecklistExecutions((data) => {
          setExecutions(data);
          setLoading(false);
        });
      } catch (err) {
        console.error("Помилка підписки на чек-листи:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      const fetchData = async () => {
        try {
          const [templatesData, executionsData] = await Promise.all([
            getChecklistTemplates(),
            getChecklistExecutions(),
          ]);
          setTemplates(templatesData);
          setExecutions(executionsData);
        } catch (err) {
          console.error("Помилка завантаження чек-листів:", err);
          setError(err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }

    return () => {
      if (unsubscribeTemplates) unsubscribeTemplates();
      if (unsubscribeExecutions) unsubscribeExecutions();
    };
  }, [enableRealtime]);

  const createTemplate = async (payload) => {
    try {
      const id = await addChecklistTemplate(payload);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateTemplate = async (id, payload) => {
    try {
      await updateChecklistTemplate(id, payload);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeTemplate = async (id) => {
    try {
      await deleteChecklistTemplate(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createExecution = async (payload) => {
    try {
      const id = await addChecklistExecution(payload);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateExecution = async (id, payload) => {
    try {
      await updateChecklistExecution(id, payload);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeExecution = async (id) => {
    try {
      await deleteChecklistExecution(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    templates,
    executions,
    loading,
    error,
    createTemplate,
    updateTemplate,
    removeTemplate,
    createExecution,
    updateExecution,
    removeExecution,
  };
};
