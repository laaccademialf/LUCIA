import { useState, useEffect } from "react";
import {
  getCategories,
  getSubcategories,
  getAccountingTypes,
  getBusinessUnits,
  getStatuses,
  getConditions,
  getDecisions,
  getPlacementZones,
  getResponsibilityCenters,
  getResponsiblePersons,
  getFunctionalities,
  getRelevances,
  getReasons,
} from "../firebase/assetFields";

export const useAssetFields = () => {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [accountingTypes, setAccountingTypes] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [placementZones, setPlacementZones] = useState([]);
  const [responsibilityCenters, setResponsibilityCenters] = useState([]);
  const [responsiblePersons, setResponsiblePersons] = useState([]);
  const [functionalities, setFunctionalities] = useState([]);
  const [relevances, setRelevances] = useState([]);
  const [reasons, setReasons] = useState([]);
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
          placementZonesData,
          responsibilityCentersData,
          responsiblePersonsData,
          functionalitiesData,
          relevancesData,
          reasonsData,
        ] = await Promise.all([
          getCategories(),
          getSubcategories(),
          getAccountingTypes(),
          getBusinessUnits(),
          getStatuses(),
          getConditions(),
          getDecisions(),
          getPlacementZones(),
          getResponsibilityCenters(),
          getResponsiblePersons(),
          getFunctionalities(),
          getRelevances(),
          getReasons(),
        ]);

        setCategories(categoriesData.map((item) => item.name));
        setSubcategories(subcategoriesData.map((item) => item.name));
        setAccountingTypes(accountingTypesData.map((item) => item.name));
        setBusinessUnits(businessUnitsData.map((item) => item.name));
        setStatuses(statusesData.map((item) => item.name));
        setConditions(conditionsData.map((item) => item.name));
        setDecisions(decisionsData.map((item) => item.name));
        setPlacementZones(placementZonesData.map((item) => item.name));
        setResponsibilityCenters(responsibilityCentersData);
        setResponsiblePersons(responsiblePersonsData);
        setFunctionalities(functionalitiesData.map((item) => item.name));
        setRelevances(relevancesData.map((item) => item.name));
        setReasons(reasonsData.map((item) => item.name));
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
    placementZones,
    responsibilityCenters,
    responsiblePersons,
    functionalities,
    relevances,
    reasons,
    loading,
  };
};
