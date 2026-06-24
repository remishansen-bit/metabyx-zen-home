// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createCircle, joinByCode, leaveCircle, listCircles } from "./circles";

beforeEach(() => {
  window.localStorage.clear();
});

describe("circles persistence", () => {
  it("seeds with the preview circles on first read", () => {
    const seeded = listCircles();
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((c) => c.source === "preview")).toBe(true);
  });

  it("persists a created circle across reads", () => {
    const c = createCircle("My Room", "private");
    expect(c.joinCode).toBeTruthy();
    expect(listCircles()[0]).toMatchObject({ id: c.id, name: "My Room" });
    // simulate reload
    const raw = window.localStorage.getItem("metabyx:circles:v1");
    expect(raw).toContain("My Room");
  });

  it("joining a code idempotently returns the existing circle", () => {
    const a = createCircle("Shared", "private");
    const b = joinByCode(a.joinCode!);
    expect(b.id).toBe(a.id);
    expect(listCircles().filter((c) => c.joinCode === a.joinCode)).toHaveLength(1);
  });

  it("joining an unknown code creates a placeholder room", () => {
    const joined = joinByCode("WXYZ-1234");
    expect(joined.source).toBe("joined");
    expect(listCircles().some((c) => c.id === joined.id)).toBe(true);
  });

  it("rejects codes that are too short", () => {
    expect(() => joinByCode("AB")).toThrow();
  });

  it("leaveCircle removes the circle", () => {
    const c = createCircle("Temporary", "public");
    leaveCircle(c.id);
    expect(listCircles().some((x) => x.id === c.id)).toBe(false);
  });
});