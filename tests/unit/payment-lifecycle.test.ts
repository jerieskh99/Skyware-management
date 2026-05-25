import { describe, it, expect } from "vitest";
import {
  isAllowedTransition,
  nextStates,
} from "@/lib/billing/payment-lifecycle";
import type { PaymentStatus } from "@prisma/client";

const ALL_STATUSES: PaymentStatus[] = [
  "draft",
  "sent_to_client",
  "waiting_for_payment",
  "partially_paid",
  "paid",
  "cancelled",
  "overdue",
];

const EXPECTED: Record<PaymentStatus, PaymentStatus[]> = {
  draft:               ["sent_to_client", "cancelled"],
  sent_to_client:      ["waiting_for_payment", "cancelled", "draft"],
  waiting_for_payment: ["partially_paid", "paid", "overdue", "cancelled"],
  partially_paid:      ["paid", "overdue", "cancelled"],
  paid:                [],
  cancelled:           [],
  overdue:             ["partially_paid", "paid", "cancelled"],
};

describe("isAllowedTransition", () => {
  it("allows no-op for every status", () => {
    for (const s of ALL_STATUSES) {
      expect(isAllowedTransition(s, s)).toBe(true);
    }
  });

  it("matches the EXPECTED matrix for every (from, to) pair", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = from === to || EXPECTED[from].includes(to);
        const actual = isAllowedTransition(from, to);
        expect(
          actual,
          `expected ${from} -> ${to} to be ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it("paid is terminal: rejects every distinct target", () => {
    for (const to of ALL_STATUSES) {
      if (to === "paid") continue;
      expect(isAllowedTransition("paid", to)).toBe(false);
    }
  });

  it("cancelled is terminal: rejects every distinct target", () => {
    for (const to of ALL_STATUSES) {
      if (to === "cancelled") continue;
      expect(isAllowedTransition("cancelled", to)).toBe(false);
    }
  });

  it("draft can move forward to sent_to_client and to cancelled, but not to paid", () => {
    expect(isAllowedTransition("draft", "sent_to_client")).toBe(true);
    expect(isAllowedTransition("draft", "cancelled")).toBe(true);
    expect(isAllowedTransition("draft", "paid")).toBe(false);
    expect(isAllowedTransition("draft", "partially_paid")).toBe(false);
    expect(isAllowedTransition("draft", "overdue")).toBe(false);
    expect(isAllowedTransition("draft", "waiting_for_payment")).toBe(false);
  });

  it("sent_to_client may step back to draft", () => {
    expect(isAllowedTransition("sent_to_client", "draft")).toBe(true);
  });

  it("waiting_for_payment can reach the three settlement states and cancelled", () => {
    expect(isAllowedTransition("waiting_for_payment", "partially_paid")).toBe(true);
    expect(isAllowedTransition("waiting_for_payment", "paid")).toBe(true);
    expect(isAllowedTransition("waiting_for_payment", "overdue")).toBe(true);
    expect(isAllowedTransition("waiting_for_payment", "cancelled")).toBe(true);
    expect(isAllowedTransition("waiting_for_payment", "draft")).toBe(false);
  });

  it("overdue can recover via partially_paid or paid or be cancelled", () => {
    expect(isAllowedTransition("overdue", "partially_paid")).toBe(true);
    expect(isAllowedTransition("overdue", "paid")).toBe(true);
    expect(isAllowedTransition("overdue", "cancelled")).toBe(true);
    expect(isAllowedTransition("overdue", "draft")).toBe(false);
  });
});

describe("nextStates", () => {
  it("returns the current status as the first element", () => {
    for (const s of ALL_STATUSES) {
      expect(nextStates(s)[0]).toBe(s);
    }
  });

  it("terminal states return only themselves", () => {
    expect(nextStates("paid")).toEqual(["paid"]);
    expect(nextStates("cancelled")).toEqual(["cancelled"]);
  });

  it("returns the matrix entry for non-terminal states", () => {
    for (const from of ALL_STATUSES) {
      const got = nextStates(from);
      expect(got).toEqual([from, ...EXPECTED[from]]);
    }
  });
});
