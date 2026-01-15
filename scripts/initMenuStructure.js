// Скрипт для ініціалізації структури меню у Firestore
import { saveMenuStructure } from "../src/firebase/menuStructure";

const initialMenuStructure = [
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
          { id: "projects", label: "Управління проєктами" }
        ]
      },
      {
        id: "settings-accounts",
        label: "Користувачі",
        tabs: ["add", "edit"],
        tabLabels: [
          { id: "add", label: "Додати" },
          { id: "edit", label: "Редагувати" }
        ]
      },
      {
        id: "settings-permissions",
        label: "Доступи",
        tabs: ["roles", "permissions"],
        tabLabels: [
          { id: "roles", label: "Ролі та Посади" },
          { id: "permissions", label: "Доступи ролей" }
        ]
      }
    ]
  },
  {
    id: "inventory",
    label: "Облік активів",
    children: [
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
          { id: "responsibility", label: "Матеріальна відповідальність" }
        ]
      }
    ]
  }
];

async function run() {
  await saveMenuStructure(initialMenuStructure);
  console.log("Структуру меню ініціалізовано у Firestore!");
}

run();
