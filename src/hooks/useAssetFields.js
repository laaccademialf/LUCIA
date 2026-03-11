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
import { isCollectionsApiEnabled, listCollectionItemsApi } from "../api/collectionsApi";

export const useAssetFields = () => {
  const [categories, setCategories] = useState([]);
  const [categoryItems, setCategoryItems] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [subcategoryItems, setSubcategoryItems] = useState([]);
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

  const normalizeCategoryItem = (item) => {
    if (!item || typeof item !== "object") return { id: "", name: "" };
    return {
      ...item,
      id: String(item.id || item.categoryId || item.category_id || "").trim(),
      name: String(item.name || item.categoryName || item.category_name || "").trim(),
    };
  };

  const normalizeSubcategoryItem = (item, categoryNameById) => {
    if (!item || typeof item !== "object") {
      return { id: "", name: "", categoryId: "", categoryName: "" };
    }

    const categoryId = String(item.categoryId || item.category_id || "").trim();
    const fallbackCategoryName = categoryId ? String(categoryNameById.get(categoryId) || "").trim() : "";

    return {
      ...item,
      id: String(item.id || item.subcategoryId || item.subcategory_id || "").trim(),
      name: String(item.name || item.subCategory || item.sub_category || "").trim(),
      categoryId,
      categoryName: String(item.categoryName || item.category_name || fallbackCategoryName || "").trim(),
    };
  };

  const normalizeResponsibilityCenter = (item) => {
    if (!item || typeof item !== "object") return { id: "", name: "" };
    return {
      ...item,
      id: String(item.id || item.centerId || item.center_id || "").trim(),
      name: String(item.name || item.centerName || item.center_name || "").trim(),
    };
  };

  const normalizeResponsiblePerson = (item, centerIdByName) => {
    if (!item || typeof item !== "object") return { id: "", name: "", centerId: "" };

    const rawCenterId = String(item.centerId || item.center_id || "").trim();
    const rawCenterName = String(item.centerName || item.center_name || "").trim();
    const resolvedCenterId = rawCenterId || String(centerIdByName.get(rawCenterName) || "").trim();

    return {
      ...item,
      id: String(item.id || item.personId || item.person_id || "").trim(),
      name: String(item.name || item.personName || item.person_name || "").trim(),
      centerId: resolvedCenterId,
      centerName: rawCenterName,
    };
  };

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
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetCategories") : getCategories(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetSubcategories") : getSubcategories(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetAccountingTypes") : getAccountingTypes(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetBusinessUnits") : getBusinessUnits(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetStatuses") : getStatuses(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetConditions") : getConditions(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetDecisions") : getDecisions(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetPlacementZones") : getPlacementZones(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetResponsibilityCenters") : getResponsibilityCenters(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetResponsiblePersons") : getResponsiblePersons(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetFunctionalities") : getFunctionalities(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetRelevances") : getRelevances(),
          isCollectionsApiEnabled() ? listCollectionItemsApi("assetReasons") : getReasons(),
        ]);

        const normalizedCategories = (Array.isArray(categoriesData) ? categoriesData : [])
          .map(normalizeCategoryItem)
          .filter((item) => item.id || item.name);
        const categoryNameById = new Map(
          normalizedCategories.map((item) => [String(item.id || "").trim(), String(item.name || "").trim()])
        );
        const normalizedSubcategories = (Array.isArray(subcategoriesData) ? subcategoriesData : [])
          .map((item) => normalizeSubcategoryItem(item, categoryNameById))
          .filter((item) => item.id || item.name);

        setCategories(normalizedCategories.map((item) => item.name));
        setCategoryItems(normalizedCategories);
        setSubcategories(normalizedSubcategories.map((item) => item.name));
        setSubcategoryItems(normalizedSubcategories);
        setAccountingTypes(accountingTypesData.map((item) => item.name));
        setBusinessUnits(businessUnitsData.map((item) => item.name));
        setStatuses(statusesData.map((item) => item.name));
        setConditions(conditionsData.map((item) => item.name));
        setDecisions(decisionsData.map((item) => item.name));
        setPlacementZones(placementZonesData.map((item) => item.name));
        const normalizedCenters = (Array.isArray(responsibilityCentersData) ? responsibilityCentersData : [])
          .map(normalizeResponsibilityCenter)
          .filter((item) => item.id || item.name);
        const centerIdByName = new Map(
          normalizedCenters.map((item) => [String(item.name || "").trim(), String(item.id || "").trim()])
        );
        const normalizedPersons = (Array.isArray(responsiblePersonsData) ? responsiblePersonsData : [])
          .map((item) => normalizeResponsiblePerson(item, centerIdByName))
          .filter((item) => item.id || item.name);

        setResponsibilityCenters(normalizedCenters);
        setResponsiblePersons(normalizedPersons);
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
    categoryItems,
    subcategories,
    subcategoryItems,
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
