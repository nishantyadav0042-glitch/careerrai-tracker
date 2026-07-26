const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = '/tmp/claude-0/-home-user-careerrai-tracker/322402b3-1878-5778-9aa6-9a92b1189f6e/scratchpad';
const LOGO = '/home/user/careerrai-tracker/public/careerrai-logo.png';

(async () => {
  const src = process.argv[2] || path.join(DIR, 'feature-graphic.html');
  const out = process.argv[3] || path.join(DIR, 'feature-graphic-1024x500.png');

  const logoData = 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64');
  const html = fs.readFileSync(src, 'utf8').replace('LOGO_SRC', logoData);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out });
  await browser.close();
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
})();
