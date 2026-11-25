# Tile images

The SVG files in this folder are the "Regular" set from [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles) (commit `26e127ba2117f45cdce5ea0225748cc0cfad3169`), copied unchanged. They are in the public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)); see [LICENSE.md](LICENSE.md).

All images share a 300×400 viewBox:

- `Front.svg` is the blank tile body.
- `Man1-9`, `Pin1-9`, `Sou1-9`, `Man5-Dora`/`Pin5-Dora`/`Sou5-Dora` (red fives), `Ton`, `Nan`, `Shaa`, `Pei`, `Haku`, `Hatsu` and `Chun` are transparent faces drawn over `Front.svg`. The viewer shows each face as an `<img>` with `Front.svg` as its CSS background (`src/ui/TileImage.tsx`).
- `Back.svg` is a complete face-down tile, used for hidden and unknown tiles.
- `Blank.svg` (a "?" face) is kept with the set but not used.
