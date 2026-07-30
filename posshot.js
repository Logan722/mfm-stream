const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  for (const [name, url] of [
    ['pos-tr', '/program.html?demo=1&mode=grid&card=scripture&n=4&pos=tr'],
    ['pos-bc', '/program.html?demo=1&mode=dominant&card=prayer&n=5&pos=bc'],
  ]) {
    await page.goto('http://localhost:8123' + url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/home/claude/shot-${name}.png` });
    console.log('shot:', name);
  }
  await browser.close();
})();
