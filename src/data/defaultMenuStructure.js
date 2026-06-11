export const DEFAULT_MENU_STRUCTURE = [
  {
    id: "dashboard",
    label: "Дашборд",
    children: [
      { id: "dashboard-ops", label: "Операційний огляд", tabs: [], tabLabels: [] },
    ],
  },
  {
    id: "settings",
    label: "Налаштування",
    children: [
      {
        id: "settings-restaurant",
        label: "Ресторани",
        tabs: ["main", "schedule", "projects"],
        tabLabels: [
          { id: "main", label: "Головні" },
          { id: "schedule", label: "Графік роботи" },
          { id: "projects", label: "Управління проєктами" },
        ],
      },
      {
        id: "settings-accounts",
        label: "Облікові записи",
        tabs: ["add", "edit"],
        tabLabels: [
          { id: "add", label: "Додати" },
          { id: "edit", label: "Редагувати" },
        ],
      },
      {
        id: "settings-permissions",
        label: "Права доступу",
        tabs: ["roles", "permissions"],
        tabLabels: [
          { id: "roles", label: "Ролі та Посади" },
          { id: "permissions", label: "Доступи ролей" },
        ],
      },
    ],
  },
  {
    id: "operations",
    label: "Операції",
    children: [
      {
        id: "ops-checklists",
        label: "Чек-листи",
        tabs: ["openingchecklist", "haccpaudit", "haccptemplates", "settingchecklists"],
        tabLabels: [
          { id: "openingchecklist", label: "Чеклисти" },
          { id: "haccpaudit", label: "HACCP" },
          { id: "haccptemplates", label: "Шаблони HACCP" },
          { id: "settingchecklists", label: "Налаштування чеклистів" },
        ],
      },
      { id: "ops-haccp", label: "HACCP журнали", tabs: [], tabLabels: [] },
      { id: "ops-maintenance", label: "Сервісні заявки", tabs: [], tabLabels: [] },
    ],
  },
  {
    id: "inventory",
    label: "Облік",
    children: [
      { id: "inventory-utilities", label: "Утиліти", tabs: [], tabLabels: [] },
      {
        id: "inventory-assets",
        label: "Основні засоби",
        tabs: ["search", "test1", "test2", "test3", "test4", "responsibility"],
        tabLabels: [
          { id: "search", label: "Пошук" },
          { id: "test1", label: "Додати" },
          { id: "test2", label: "Редагувати" },
          { id: "test3", label: "Типові поля" },
          { id: "test4", label: "Права редагування" },
          { id: "responsibility", label: "Матеріальна відповідальність" },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Звіти",
    children: [
      { id: "reports-products", label: "Інвентаризація продуктів", tabs: [], tabLabels: [] },
      { id: "reports-assets", label: "Основні засоби", tabs: [], tabLabels: [] },
    ],
  },
  {
    id: "security",
    label: "Безпека",
    children: [
      { id: "security-audit", label: "Аудит дій", tabs: [], tabLabels: [] },
    ],
  },
  {
    id: "team",
    label: "Команда",
    children: [
      {
        id: "team-roles",
        label: "Персонал",
        tabs: ["mystaffing", "myrequest", "jobtitlesettings", "recruitment"],
        tabLabels: [
          { id: "mystaffing", label: "Мій персонал" },
          { id: "myrequest", label: "Заявки" },
          { id: "jobtitlesettings", label: "Керування посадами" },
          { id: "recruitment", label: "Рекрутер" },
        ],
      },
    ],
  },
  {
    id: "maintenance",
    label: "Сервіс",
    children: [
      { id: "maintenance-plan", label: "Планові роботи", tabs: [], tabLabels: [] },
      { id: "menu-admin", label: "Управління меню", tabs: [], tabLabels: [] },
    ],
  },
];
