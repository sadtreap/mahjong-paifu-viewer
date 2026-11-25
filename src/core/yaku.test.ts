import { describe, expect, it } from "vitest";
import { YAKU_KEYS, yakuKeyFromMjaiName, yakuKeyFromTenhouId, yakuKeyFromTenhouName } from "./yaku";

describe("yaku lookups", () => {
  it("maps Tenhou ids in order", () => {
    expect(yakuKeyFromTenhouId(0)).toBe("menzenTsumo");
    expect(yakuKeyFromTenhouId(1)).toBe("riichi");
    expect(yakuKeyFromTenhouId(20)).toBe("chun");
    expect(yakuKeyFromTenhouId(54)).toBe("akaDora");
    expect(yakuKeyFromTenhouId(55)).toBeUndefined();
  });

  it("maps Tenhou names regardless of spacing and digit width", () => {
    expect(yakuKeyFromTenhouName("役牌 發")).toBe("hatsu");
    expect(yakuKeyFromTenhouName("役牌發")).toBe("hatsu");
    expect(yakuKeyFromTenhouName("国士無双13面")).toBe("kokushiMusou13");
    expect(yakuKeyFromTenhouName("赤ドラ")).toBe("akaDora");
    expect(yakuKeyFromTenhouName("unknown")).toBeUndefined();
  });

  it("maps mjai names", () => {
    expect(yakuKeyFromMjaiName("tanyaochu")).toBe("tanyao");
    expect(yakuKeyFromMjaiName("jikaze")).toBe("seatWind");
  });

  it("has unique keys", () => {
    expect(new Set(YAKU_KEYS).size).toBe(YAKU_KEYS.length);
  });
});
