import { describe, expect, it } from "vitest";
import { getAssignableUsers, getUserTaskScope, getTaskResponsibleOptions, matchesTaskFilters } from "./projectManagementUtils";

describe("getAssignableUsers", () => {
  it("адмін бачить весь список відповідальних навіть для ролі Адміністратор", () => {
    const users = [
      { id: "u1", displayName: "Alice" },
      { id: "u2", displayName: "Bob" },
      { id: "u3", displayName: "Carol" },
    ];

    const visible = getAssignableUsers(users, { id: "admin-1", role: "Адміністратор", displayName: "Admin" }, [], []).map((row) => row.id).sort();

    expect(visible).toEqual(["u1", "u2", "u3"]);
  });

  it("керівник відділу (не 'manager'/'директор') бачить свого підлеглого по дереву посад", () => {
    const users = [
      { id: "boss", displayName: "Вадим", position: "Керівник відділу аналітики" },
      { id: "sub", displayName: "Підлеглий", position: "Аналітик" },
      { id: "other", displayName: "Стороння людина", position: "Бухгалтер" },
    ];
    const positions = [
      { id: "pos-head", name: "Керівник відділу аналітики", parentId: null },
      { id: "pos-analyst", name: "Аналітик", parentId: "pos-head" },
      { id: "pos-accountant", name: "Бухгалтер", parentId: null },
    ];

    const visible = getAssignableUsers(users, users[0], [], positions).map((row) => row.id);

    expect(visible).toContain("sub");
    expect(visible).not.toContain("other");
  });
});

describe("getUserTaskScope", () => {
  it("показує тільки власну гілку керівника і ланцюг предків, а не сусідні підзадачі", () => {
    const tasks = [
      { id: "root", assigneeId: "u1", targetType: "person", target: "Alice" },
      { id: "branch-a", parentTaskId: "root", assigneeId: "u1", targetType: "person", target: "Alice" },
      { id: "branch-b", parentTaskId: "root", assigneeId: "u3", targetType: "person", target: "Carol" },
      { id: "delegated", parentTaskId: "branch-a", assigneeId: "u2", targetType: "person", target: "Bob" },
    ];

    const visibleIds = [...getUserTaskScope(tasks, { id: "u2", displayName: "Bob" })].sort();

    expect(visibleIds).toEqual(["branch-a", "delegated", "root"].sort());
  });
});

describe("task filters", () => {
  it("збирає список відповідальних з існуючих задач і фільтрує за ним", () => {
    const tasks = [
      { id: "t1", title: "Перша задача", priority: "high", dueDate: "2026-09-08", target: "Вадим" },
      { id: "t2", title: "Друга задача", priority: "normal", dueDate: "2026-09-10", target: "Марія" },
      { id: "t3", title: "Третя задача", priority: "low", dueDate: "2026-09-15", assigneeName: "Вадим" },
    ];

    expect(getTaskResponsibleOptions(tasks)).toEqual(["Вадим", "Марія"]);
    expect(matchesTaskFilters(tasks[0], { priorityFilter: "all", deadlineFilter: "all", assigneeFilter: "Вадим" })).toBe(true);
    expect(matchesTaskFilters(tasks[1], { priorityFilter: "all", deadlineFilter: "all", assigneeFilter: "Вадим" })).toBe(false);
  });
});
