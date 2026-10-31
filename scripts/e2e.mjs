import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.argv[2] || "http://127.0.0.1:8088/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1280, height: 1000 },
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});
page.on("response", async (res) => {
  if (res.url().includes("/api/track")) {
    console.log("[track]", res.status(), (await res.text()).slice(0, 120));
  }
});

await page.goto(URL, { waitUntil: "networkidle0" });
await page.type("input", "测试同学");
await page.evaluate(() => {
  const inputs = document.querySelectorAll("input");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(inputs[1], "五年级二班");
  inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await page.click(".primary-btn");
await sleep(1200);
await page.screenshot({ path: "/tmp/shots/task1.png" });

// 拖动日期滑块到 2026-04-21（索引 33? 实际 0..29，4/21 = 3/19+33 超出）
await page.evaluate(() => {
  const s = document.querySelector(".slider");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(s, "29");
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(900);
await page.click(".reveal-btn");
await sleep(600);
await page.screenshot({ path: "/tmp/shots/task2.png" });

// 第 1 题：选第二个选项（正确），提交，下一题
await page.evaluate(() => {
  document.querySelectorAll(".option")[1].click();
});
await sleep(300);
await page.click(".actions .primary-btn");
await sleep(800);
await page.screenshot({ path: "/tmp/shots/task3.png" });
await page.evaluate(() => {
  const btns = [...document.querySelectorAll(".actions .primary-btn")];
  btns[btns.length - 1].click();
});
await sleep(700);

// 第 2 题：选第三个（正确）
await page.evaluate(() => {
  document.querySelectorAll(".option")[2].click();
});
await sleep(300);
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".actions .primary-btn")].pop();
  b.click();
});
await sleep(700);
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".actions .primary-btn")].pop();
  b.click();
});
await sleep(700);

// 第 3 题（多选）：选 0、1、4
await page.evaluate(() => {
  const opts = document.querySelectorAll(".option");
  [0, 1, 4].forEach((i) => opts[i].click());
});
await sleep(300);
await page.screenshot({ path: "/tmp/shots/task4.png" });
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(700);
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(700);

// 第 4 题（排序）
await page.screenshot({ path: "/tmp/shots/task5.png" });
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const chip = document.querySelector(".chip");
    if (chip) chip.click();
  });
  await sleep(250);
}
await page.screenshot({ path: "/tmp/shots/task6.png" });
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(700);
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(700);

// 第 5 题
await page.evaluate(() => {
  document.querySelectorAll(".option")[2].click();
});
await sleep(200);
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(700);
await page.evaluate(() => {
  [...document.querySelectorAll(".actions .primary-btn")].pop().click();
});
await sleep(800);

// 第 6 题（开放题）
await page.screenshot({ path: "/tmp/shots/task7.png" });
await page.type(".open-input", "月亮会一天比一天圆一点。");
await sleep(300);
await page.evaluate(() => {
  document.querySelector(".actions .primary-btn").click();
});
await sleep(1500);
await page.screenshot({ path: "/tmp/shots/done.png" });

// 看板
await page.goto("http://127.0.0.1:8088/dashboard", { waitUntil: "networkidle0" });
await sleep(800);
await page.screenshot({ path: "/tmp/shots/dash.png", fullPage: true });

await browser.close();
console.log("done");
