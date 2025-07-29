const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const data = await page.screenshot({ encoding: 'base64', fullPage: true });
  await browser.close();
  fs.writeFileSync('preview.md', `![Server Preview](data:image/png;base64,${data})`);
})();
