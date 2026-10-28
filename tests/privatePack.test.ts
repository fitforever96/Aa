import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decryptPack, encryptPack, normalizePasscode, WrongPasscodeError } from "@/lib/privatePack";

describe("Encrypted private data pack", () => {
  it("round-trips with the passcode and tolerates dashes/case", async () => {
    const pack = await encryptPack(JSON.stringify({ hello: "world" }), "AB12-CD34-EF56-GH78", 1000);
    expect(await decryptPack(pack, "ab12cd34ef56gh78")).toEqual({ hello: "world" });
    expect(normalizePasscode(" ab12-cd34 ")).toBe("AB12CD34");
  });
  it("rejects a wrong passcode", async () => {
    const pack = await encryptPack("{}", "RIGHT-PASS-CODE-0001", 1000);
    await expect(decryptPack(pack, "WRONG-PASS-CODE-0001")).rejects.toBeInstanceOf(WrongPasscodeError);
  });
  it("the published file contains no readable customer data", () => {
    const raw = readFileSync("public/private-pack.enc.json", "utf8");
    const j = JSON.parse(raw);
    expect(j.format).toBe("orkin-private-pack-encrypted");
    expect(j.iterations).toBeGreaterThanOrEqual(600000);
    expect(raw).not.toMatch(/NRP|Pontiac|Dearborn|historical|priceCents/);
  });
});
