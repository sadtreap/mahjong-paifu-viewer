import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allTileImageUrls,
  preloadTileImages,
  TILE_BACK_URL,
  TILE_FRONT_URL,
  tileFaceName,
  tileImageUrl,
} from "./tileAssets";

describe("tileFaceName", () => {
  it("maps number tiles to the suit files", () => {
    expect(tileFaceName("1m")).toBe("Man1");
    expect(tileFaceName("9p")).toBe("Pin9");
    expect(tileFaceName("5s")).toBe("Sou5");
  });

  it("maps red fives to the Dora variants", () => {
    expect(tileFaceName("0m")).toBe("Man5-Dora");
    expect(tileFaceName("0p")).toBe("Pin5-Dora");
    expect(tileFaceName("0s")).toBe("Sou5-Dora");
  });

  it("maps honors in East, South, West, North, haku, hatsu, chun order", () => {
    expect(["1z", "2z", "3z", "4z", "5z", "6z", "7z"].map((t) => tileFaceName(t as "1z"))).toEqual([
      "Ton",
      "Nan",
      "Shaa",
      "Pei",
      "Haku",
      "Hatsu",
      "Chun",
    ]);
  });

  it("has no face for unknown tiles", () => {
    expect(tileFaceName("?")).toBeNull();
  });
});

describe("tileImageUrl", () => {
  it("builds URLs under the base path's tiles folder", () => {
    expect(tileImageUrl("Man1")).toBe(`${import.meta.env.BASE_URL}tiles/Man1.svg`);
    expect(TILE_FRONT_URL.endsWith("tiles/Front.svg")).toBe(true);
    expect(TILE_BACK_URL.endsWith("tiles/Back.svg")).toBe(true);
  });
});

describe("preloadTileImages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the 37 faces, the front and the back once each", () => {
    const urls = allTileImageUrls();
    expect(urls).toHaveLength(39);
    expect(new Set(urls).size).toBe(39);
    expect(urls).toContain(tileImageUrl("Man5-Dora"));
    expect(urls).toContain(tileImageUrl("Chun"));
    expect(urls).toContain(TILE_FRONT_URL);
    expect(urls).toContain(TILE_BACK_URL);
  });

  it("starts loading every image once, decoded asynchronously", () => {
    const images: { src: string; decoding: string }[] = [];
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decoding = "";
        constructor() {
          images.push(this);
        }
      },
    );
    preloadTileImages();
    preloadTileImages();
    expect(images.map((image) => image.src).sort()).toEqual(allTileImageUrls().sort());
    expect(images.every((image) => image.decoding === "async")).toBe(true);
  });
});
