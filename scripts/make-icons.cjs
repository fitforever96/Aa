// Generates PWA icons with the pre-installed Chromium: node scripts/make-icons.mjs
const { chromium } = require("playwright");
const font = require("fs").readFileSync("public/fonts/roboto-condensed-latin-800-normal.woff").toString("base64");
const html = (size, pad, radius) => `<!doctype html><html><head><style>
@font-face{font-family:RC;src:url(data:font/woff;base64,${font}) format("woff")}
body{margin:0}
.i{width:${size}px;height:${size}px;background:#111114;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;border-radius:${radius}px}
.i:before{content:"";position:absolute;left:0;right:0;top:0;height:${size * 0.07}px;background:#E4002B}
.w{font-family:RC;font-weight:800;color:#E4002B;font-size:${size * (0.25 - pad)}px;letter-spacing:${size * 0.004}px}
.s{position:absolute;bottom:${size * (0.17 + pad / 2)}px;width:${size * 0.34}px;height:${size * 0.018}px;background:#fff;opacity:.9}
</style></head><body><div class="i"><div class="w">ORKIN</div><div class="s"></div></div></body></html>`;
(async () => {
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0], ["icon-maskable-512.png", 512, 0.07]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(html(size, pad, 0));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(100);
  await p.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await b.close();
console.log("icons written");
})();
