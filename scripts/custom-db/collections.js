// Єдине джерело правди: повний перелік колекцій платформи LUCIA.
// Використовується сервером (гейт створення таблиць) і скриптом консолідації.
// Додавання нової колекції = додати сюди рядок (або env LUCIA_EXTRA_COLLECTIONS).
export const KNOWN_COLLECTIONS = [
  // core
  "assets", "restaurants", "users", "authUsers", "authSessions",
  "menuStructure", "settings", "positions", "workRoles",
  "rolePermissions", "fieldPermissions", "platformAuditLogs",
    "notificationSettings", // new collection for encrypted SMTP settings
  "viksoftSettings", // durable encrypted Vik-Soft API credentials (survive container/tmp/.env reset)
  "assetCategories", "assetSubcategories", "assetAccountingTypes",
  "assetBusinessUnits", "assetStatuses", "assetConditions", "assetDecisions",
  "assetPlacementZones", "assetResponsibilityCenters", "assetResponsiblePersons",
  "assetFunctionalities", "assetRelevances", "assetReasons",
  "assetInventorySessions",
  // utilities / electricity
  "utilityMeters", "electricityReadings", "electricitySettings",
  // sales planning (план/факт по годинах)
  "salesHourlyPlans",
  // product booking / inventory
  "bookingProducts", "bookingSuppliers", "bookingTypicalFields",
  "productOrders", "productInventories", "productInventorySessions",
  "inventoryListProducts", "supplierDispatches", "technologicalCards",
  // team
  "teamEmployees", "teamShiftEvents", "teamJobTitles",
  "teamStaffingPlans", "teamRecruitmentRequests",
  // checklists
  "checklistTemplates", "checklistExecutions",
  // service / legal
  "serviceRequests", "legalTasks", "legalNotifications", "legalModuleSettings", "projectTasks",
  // haccp
  "haccpTemplates", "haccpAudits", "haccpActionPlans",
  // payments
  "paymentRequests", "paymentTypicalFields", "paymentCounterparties",
  "paymentPayers", "paymentApprovalRoutes",
  // assortment matrix / barvino
  "assortmentMatrixItems", "assortmentMatrixTypicalFields",
  "assortmentMatrixSpecifications", "barvinoAccess",
  // catering
  "cateringSalesPlans", "cateringLocations", "cateringCalendarEvents",
  "cateringCommercialProposals", "cateringCrmContacts", "cateringCrmOrders",
  "cateringCrmTypicalFields", "cateringRoleSettings",
];

export const canonicalCollectionKey = (tableOrCollectionName) =>
  String(tableOrCollectionName || "")
    .trim()
    .toLowerCase()
    .replace(/^lucia_/, "")
    .replace(/_flat$/, "");
