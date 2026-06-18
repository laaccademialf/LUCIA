import { describe, it, expect } from "vitest";
import { hasProcurementAccess, hasSupplierPortalAccess, isGlobalAdminUser } from "./access.js";

describe("hasProcurementAccess", () => {
  it("true для закупівельних/керівних ролей", () => {
    expect(hasProcurementAccess({ role: "admin" })).toBe(true);
    expect(hasProcurementAccess({ role: "procurement" })).toBe(true);
    expect(hasProcurementAccess({ workRole: "Менеджер закупівель" })).toBe(true);
    expect(hasProcurementAccess({ workRole: "керуючий" })).toBe(true);
  });

  it("false для сторонніх ролей", () => {
    expect(hasProcurementAccess({ role: "waiter" })).toBe(false);
    expect(hasProcurementAccess({})).toBe(false);
    expect(hasProcurementAccess(null)).toBe(false);
  });
});

describe("hasSupplierPortalAccess", () => {
  it("true для постачальницьких ролей", () => {
    expect(hasSupplierPortalAccess({ role: "supplier" })).toBe(true);
    expect(hasSupplierPortalAccess({ workRole: "vendor" })).toBe(true);
    expect(hasSupplierPortalAccess({ role: "постачальник" })).toBe(true);
  });

  it("false для інших", () => {
    expect(hasSupplierPortalAccess({ role: "admin" })).toBe(false);
    expect(hasSupplierPortalAccess({})).toBe(false);
  });
});

describe("isGlobalAdminUser", () => {
  it("true лише для точної ролі admin", () => {
    expect(isGlobalAdminUser({ role: "admin" })).toBe(true);
    expect(isGlobalAdminUser({ role: "ADMIN" })).toBe(true);
  });

  it("false для решти", () => {
    expect(isGlobalAdminUser({ role: "manager" })).toBe(false);
    expect(isGlobalAdminUser({})).toBe(false);
    expect(isGlobalAdminUser(null)).toBe(false);
  });
});
