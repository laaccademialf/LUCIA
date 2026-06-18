import { describe, it, expect } from "vitest";
import {
  deriveOrderStatus,
  getSupplierResponseStatus,
  getSupplierScopedStatus,
  getSupplierResponseLabel,
  getSupplierResponseBadgeClass,
} from "./orderStatus";

describe("getSupplierResponseStatus", () => {
  it("повертає явний статус, якщо він заданий", () => {
    expect(getSupplierResponseStatus({ supplierResponseStatus: "Accepted" })).toBe("accepted");
    expect(getSupplierResponseStatus({ vendorResponseStatus: "PARTIAL" })).toBe("partial");
  });

  it("pending, якщо надіслано без явного статусу", () => {
    expect(getSupplierResponseStatus({ sentToSupplier: true })).toBe("pending");
  });

  it("draft, якщо не надіслано і без статусу", () => {
    expect(getSupplierResponseStatus({ sentToSupplier: false })).toBe("draft");
    expect(getSupplierResponseStatus({})).toBe("draft");
  });
});

describe("deriveOrderStatus", () => {
  it("залишає completed незмінним", () => {
    expect(deriveOrderStatus([{ qty: 1, sentToSupplier: true }], "completed")).toBe("completed");
  });

  it("new для порожнього набору позицій", () => {
    expect(deriveOrderStatus([], "new")).toBe("new");
  });

  it("completed, якщо всі позиції нульові", () => {
    expect(deriveOrderStatus([{ qty: 0 }, { qty: 0 }], "sent")).toBe("completed");
  });

  it("new, якщо позиції ще не надіслані", () => {
    expect(deriveOrderStatus([{ qty: 5, sentToSupplier: false }], "new")).toBe("new");
  });

  it("sent, якщо надіслано і очікує відповіді", () => {
    expect(deriveOrderStatus([{ qty: 5, sentToSupplier: true }], "sent")).toBe("sent");
  });

  it("confirmed, якщо всі надіслані позиції підтверджені", () => {
    const items = [
      { qty: 5, sentToSupplier: true, supplierResponseStatus: "accepted" },
      { qty: 3, sentToSupplier: true, supplierResponseStatus: "accepted" },
    ];
    expect(deriveOrderStatus(items, "sent")).toBe("confirmed");
  });

  it("processing, якщо є проблемні позиції (unavailable/partial)", () => {
    const items = [
      { qty: 5, sentToSupplier: true, supplierResponseStatus: "accepted" },
      { qty: 3, sentToSupplier: true, supplierResponseStatus: "unavailable" },
    ];
    expect(deriveOrderStatus(items, "sent")).toBe("processing");
  });

  it("processing, якщо частина надіслана, частина — ні", () => {
    const items = [
      { qty: 5, sentToSupplier: true, supplierResponseStatus: "accepted" },
      { qty: 3, sentToSupplier: false },
    ];
    expect(deriveOrderStatus(items, "processing")).toBe("processing");
  });

  it("сценарій перепризначення: скасована позиція + підтверджені -> confirmed", () => {
    // Після перепризначення проблемної позиції на нового постачальника
    // оригінальне замовлення має стати confirmed (баг, який ми виправляли).
    const items = [
      { qty: 5, sentToSupplier: true, supplierResponseStatus: "accepted" },
      { qty: 0, sentToSupplier: true, supplierResponseStatus: "cancelled_by_supplier" },
    ];
    expect(deriveOrderStatus(items, "sent")).toBe("confirmed");
  });
});

describe("getSupplierScopedStatus", () => {
  it("pending, якщо немає позицій", () => {
    expect(getSupplierScopedStatus({ total: 0 }).key).toBe("pending");
  });

  it("issues, якщо є проблемні позиції", () => {
    expect(getSupplierScopedStatus({ total: 3, unavailable: 1 }).key).toBe("issues");
    expect(getSupplierScopedStatus({ total: 3, partial: 1 }).key).toBe("issues");
  });

  it("partial, якщо частина підтверджена, частина очікує", () => {
    expect(getSupplierScopedStatus({ total: 3, pending: 1, accepted: 2 }).key).toBe("partial");
  });

  it("sent, якщо все ще очікує без підтверджень", () => {
    expect(getSupplierScopedStatus({ total: 3, pending: 3 }).key).toBe("sent");
  });

  it("confirmed, якщо все підтверджено", () => {
    expect(getSupplierScopedStatus({ total: 3, accepted: 3 }).key).toBe("confirmed");
  });
});

describe("getSupplierResponseLabel / BadgeClass", () => {
  it("повертає коректні мітки", () => {
    expect(getSupplierResponseLabel("accepted")).toBe("Підтверджено");
    expect(getSupplierResponseLabel("cancelled_by_supplier")).toBe("Скасовано постачальником");
    expect(getSupplierResponseLabel("unknown")).toBe("Чернетка");
  });

  it("скасована позиція має закреслений бейдж", () => {
    expect(getSupplierResponseBadgeClass("cancelled_by_supplier")).toContain("line-through");
  });
});
