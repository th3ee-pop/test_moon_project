import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.argv[2] || "http://127.0.0.1:3000/";
const OUT = "/tmp/shots3d";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await page.click(".primary-btn");
await page.waitForSelector(".moon-stage", { timeout: 20000 });
await page.waitForFunction(() => document.querySelector(".scene3d canvas"), { timeout: 25000 });
await new Promise((r) => setTimeout(r, 1800));

const canvasSize = await page.$eval(".scene3d canvas", (c) => `${c.width}x${c.height}`);
console.log("canvas 像素尺寸:", canvasSize);

const max = await page.$eval(".slider", (e) => Number(e.max));
console.log("滑条最大索引:", max);

const setIdx = async (v) => {
  await page.evaluate((val) => {
    const s = document.querySelector(".slider");
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(s, String(val));
    s.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await new Promise((r) => setTimeout(r, 550));
};

const picks = [0, 3, 7, 11, 15, 18, 22, 26].filter((i) => i <= max);
for (const i of picks) {
  await setIdx(i);
  const date = await page.$eval(".date-readout strong", (e) => e.textContent);
  const el = await page.$(".observatory");
  await el.screenshot({ path: `${OUT}/idx-${String(i).padStart(2, "0")}.png` });
  console.log(String(i).padStart(2, "0"), date);
}

await setIdx(11);
await page.click(".view-switch button:nth-child(2)");
await new Promise((r) => setTimeout(r, 1500));
await (await page.$(".observatory")).screenshot({ path: `${OUT}/space.png` });
console.log("太空视角已截图");

await setIdx(7);
await new Promise((r) => setTimeout(r, 900));
await (await page.$(".observatory")).screenshot({ path: `${OUT}/space-quarter.png` });
console.log("太空视角（上弦）已截图");

await browser.close();
