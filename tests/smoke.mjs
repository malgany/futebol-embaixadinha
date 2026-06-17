import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:5173";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("canvas");
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
  const phone = document.querySelector("#phone");
  const canvas = document.querySelector("canvas");
  const box = phone.getBoundingClientRect();
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let darkPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 80 && pixels[index + 1] < 90 && pixels[index + 2] < 105 && pixels[index + 3] > 180) {
      darkPixels += 1;
    }
  }

  return {
    phoneWidth: Math.round(box.width),
    phoneHeight: Math.round(box.height),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    darkPixels
  };
});

await page.touchscreen.tap(90, 650);
await page.touchscreen.tap(300, 650);
await page.waitForTimeout(250);

await browser.close();

if (errors.length > 0) {
  throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

if (result.phoneWidth > 430 || result.phoneHeight < 600 || result.darkPixels < 500) {
  throw new Error(`Unexpected render result: ${JSON.stringify(result)}`);
}

console.log(`Smoke OK: ${JSON.stringify(result)}`);
