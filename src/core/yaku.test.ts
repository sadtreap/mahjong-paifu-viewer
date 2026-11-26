import { describe, expect, it } from "vitest";
import {
  tenhouYakuName,
  YAKU_KEYS,
  yakuKeyFromMjaiName,
  yakuKeyFromTenhouId,
  yakuKeyFromTenhouName,
} from "./yaku";

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

  it("names every key but the generic yakuhai the way yakuKeyFromTenhouName reads it", () => {
    expect(tenhouYakuName("chun")).toBe("役牌 中");
    expect(tenhouYakuName("doubleRiichi")).toBe("両立直");
    expect(tenhouYakuName("seatWind")).toBe("役牌:自風牌");
    expect(tenhouYakuName("nukidora")).toBe("抜きドラ");
    expect(tenhouYakuName("yakuhai")).toBeUndefined();
    for (const key of YAKU_KEYS.filter((key) => key !== "yakuhai")) {
      expect(yakuKeyFromTenhouName(tenhouYakuName(key) as string), key).toBe(key);
    }
  });

  it("has unique keys", () => {
    expect(new Set(YAKU_KEYS).size).toBe(YAKU_KEYS.length);
  });
});
