import { beforeAll, describe, expect, it } from "vitest";
import { readSession, signSession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
});

describe("sign-in cookie", () => {
  it("round-trips who is signed in", () => {
    const s = readSession(signSession("u1", "a@b.co"));
    expect(s).toMatchObject({ uid: "u1", email: "a@b.co" });
  });
  it("rejects a tampered or expired cookie", () => {
    const t = signSession("u1", null);
    expect(readSession(t.replace(/^./, "A"))).toBeNull();
    expect(readSession(t + "x")).toBeNull();
    expect(readSession(signSession("u1", null, 0), Date.now())).toBeNull();
    expect(readSession(undefined)).toBeNull();
  });
});
