import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(process.argv[2] || "http://127.0.0.1:8088/", { waitUntil: "networkidle0" });
await page.type("input:not([type])", "极值检查");
await (await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("开始观察")))).click();
await new Promise((r) => setTimeout(r, 2500));

// 揭晓月相名称，才能读到照亮比例
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("揭晓"))?.click());
await new Promise((r) => setTimeout(r, 400));

const setDate = (v) => page.evaluate((val) => {
  const s = document.querySelector('input[type="range"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(s, String(val));
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
}, v);

const read = () => page.evaluate(() => ({
  date: document.querySelector(".date-readout strong")?.textContent?.trim() ?? "",
  illum: document.querySelector(".reveal-note")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
}));

const rows = [];
for (let i = 0; i <= 39; i += 1) {
  await setDate(i);
  await new Promise((r) => setTimeout(r, 120));
  const r = await read();
  rows.push({ i, ...r });
}
console.log(rows.map((r) => `${r.i}:${r.date} ${r.illum}`).join("\n"));

const num = (s) => Number((s.match(/照亮约\s*(\d+)/) || [])[1] ?? NaN);
const withNum = rows.map((r) => ({ ...r, n: num(r.illum) })).filter((r) => !Number.isNaN(r.n));
const minI = withNum.reduce((a, b) => (b.n < a.n ? b : a));
const maxI = withNum.reduce((a, b) => (b.n > a.n ? b : a));
console.log("最暗:", minI, "\n最亮:", maxI);

for (const [tag, item] of [["newmoon", minI], ["fullmoon", maxI]]) {
  await setDate(item.i);
  await new Promise((r) => setTimeout(r, 500));
  const btns = await page.$$(".view-switch button");
  await btns[1].click();
  await new Promise((r) => setTimeout(r, 1200));
  const stage = await page.$(".moon-stage");
  await stage.screenshot({ path: `/tmp/space-${tag}.png` });
  console.log(`已截 ${tag} (index ${item.i})`);
  await btns[0].click();
  await new Promise((r) => setTimeout(r, 800));
  await stage.screenshot({ path: `/tmp/earth-${tag}.png` });
}
await browser.close();
