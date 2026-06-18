// Чисті хелпери визначення прав доступу користувача в модулі замовлень.
// НЕ містять залежностей від React.

// Доступ до закупівель/керування (адмін, закупівлі, менеджер тощо).
export const hasProcurementAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = [
    "admin",
    "procurement",
    "purchasing",
    "закуп",
    "закупівл",
    "постач",
    "manager",
    "керуюч",
    "управля",
  ];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

// Доступ до порталу постачальника.
export const hasSupplierPortalAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["supplier", "vendor", "постач"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

// Глобальний адміністратор.
export const isGlobalAdminUser = (user) => String(user?.role || "").toLowerCase() === "admin";
