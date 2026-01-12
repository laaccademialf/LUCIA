import { useState, useEffect } from "react";
import {
  getCategories,
  getSubcategories,
  getAccountingTypes,
  getBusinessUnits,
  getStatuses,
  getConditions,
  getDecisions,
} from "../firebase/assetFields";

export const useAssetFields = () => {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [accountingTypes, setAccountingTypes] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFields = async () => {
      try {
        const [
          categoriesData,
          subcategoriesData,
          accountingTypesData,
          businessUnitsData,
          statusesData,
          conditionsData,
          decisionsData,
        ] = await Promise.all([
          getCategories(),
          getSubcategories(),
          getAccountingTypes(),
          getBusinessUnits(),
          getStatuses(),
          getConditions(),
          getDecisions(),
        ]);

        setCategories(categoriesData.map((item) => item.name));
        setSubcategories(subcategoriesData.map((item) => item.name));
        setAccountingTypes(accountingTypesData.map((item) => item.name));
        setBusinessUnits(businessUnitsData.map((item) => item.name));
        setStatuses(statusesData.map((item) => item.name));
        setConditions(conditionsData.map((item) => item.name));
        setDecisions(decisionsData.map((item) => item.name));
      } catch (error) {
        console.error("Помилка завантаження полів:", error);
      } finally {
        setLoading(false);
      }
    };

    loadFields();
  }, []);

  return {
    categories,
    subcategories,
    accountingTypes,
    businessUnits,
    statuses,
    conditions,
    decisions,
    loading,
  };
};
