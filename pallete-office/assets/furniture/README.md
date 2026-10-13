# FireRed furniture

Source: [pret/pokefirered building tileset](https://github.com/pret/pokefirered/tree/master/data/tilesets/primary/building).
Original Pokémon FireRed graphics by Nintendo / Game Freak.

Reconstructed from `tiles.png`, `metatiles.bin`, and `palettes/00.pal` in that directory,
using the foreground halves of each metatile. Palette index 0 becomes transparent;
only fully transparent outer margins are trimmed. Original colors and pixels are preserved.

| Asset | Metatiles | Native size | Bottom-center anchor |
| --- | --- | --- | --- |
| firered-chair.png | 0x023 | 12 × 16 | 6, 16 |
| firered-table.png | 0x010, 0x011 / 0x018, 0x019 | 30 × 31 | 15, 31 |

These sprites are retained as source references. The world now uses the original isometric
wooden desk/easel artwork and matching procedural furniture instead of loading these sprites.
