import sharp from "sharp";

const SRC = "/home/crea/projects/sovrana-ws/sovrana-connect/src-tauri/s-mark-source.png";
const OUT = "/home/crea/projects/sovrana-ws/sovrana-connect/src-tauri/app-icon-master.png";

const CANVAS = 1024;
const MARK = 600; // S fits inside ~58% of the tile; padding = clear space (DESIGN §4)
const BG = { r: 10, g: 10, b: 10, alpha: 1 }; // #0A0A0A

// Trim the transparent margins around the white S, then fit (no distort) inside MARK.
const mark = await sharp(SRC)
  .trim()
  .resize(MARK, MARK, { fit: "inside", withoutEnlargement: false })
  .toBuffer();

const meta = await sharp(mark).metadata();
const left = Math.round((CANVAS - meta.width) / 2);
const top = Math.round((CANVAS - meta.height) / 2);

await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: BG },
})
  .composite([{ input: mark, left, top }])
  .png()
  .toFile(OUT);

console.log(`wrote ${OUT} (${CANVAS}x${CANVAS}, S mark ${meta.width}x${meta.height} centered on #0A0A0A)`);
