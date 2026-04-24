import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "./tokens.js";

describe("generateToken", () => {
  it("returns a 64-char hex string (32 random bytes)", () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on each call", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("returns a 64-char hex SHA-256 digest", () => {
    const h = hashToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("matches the known SHA-256 digest of 'abc'", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
