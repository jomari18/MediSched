const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [], errors = [];
  try {
    for (const role of ['patient', 'staff']) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname, 'portal-preview.html')).href + `?role=${role}&theme=${theme}`);
      const geometry = await page.evaluate(() => ({ width: innerWidth, contentWidth: document.documentElement.scrollWidth,
        shortButtons: [...document.querySelectorAll('button')].filter(n => n.offsetParent && n.getBoundingClientRect().height < 44).map(n => n.textContent),
        clippedButtons: [...document.querySelectorAll('button')].filter(n => n.offsetParent && n.scrollWidth > n.clientWidth + 1).map(n => n.textContent) }));
      if (geometry.contentWidth > width || geometry.shortButtons.length || geometry.clippedButtons.length) throw Error(JSON.stringify({ role, theme, geometry }));
      await page.screenshot({ path: path.join(__dirname, 'previews', `local-${role}-${theme}-${width}.png`), fullPage: true });
      results.push({ role, theme, width, geometry });
      if (role === 'staff') {
        await page.locator('#patientSearch').fill('Jordan');
        if (await page.locator('#staffRows tr').count() !== 1) throw Error('Search result mismatch');
        await page.locator('#staffRows button').click();
        if (!await page.locator('#previewDialog').isVisible()) throw Error('Missing action dialog');
        await page.keyboard.press('Escape');
        if (await page.locator('#previewDialog').isVisible()) throw Error('Escape did not close dialog');
      } else {
        await page.getByRole('tab', { name: 'Cancelled', exact: true }).click();
        if (!await page.locator('#patientRows').getByText('Cancelled', { exact: true }).isVisible()) throw Error('Filter mismatch');
      }
      await page.locator('#themeToggle').click();
      if (await page.locator('html').getAttribute('data-theme') === theme) throw Error('Theme did not change');
      await page.close();
    }
    if (errors.length) throw Error(JSON.stringify(errors));
    fs.writeFileSync(path.join(__dirname, 'preview-checks.json'), JSON.stringify({ scope: 'Isolated static design preview only; no Supabase or emails', browser: 'Headless local Chromium', results, errors }, null, 2));
    console.log(JSON.stringify({ layouts: results.length, overflowFailures: 0, clippedButtons: 0, pageErrors: errors.length, interactions: 'Theme switching, synthetic search/filter, dialog and Escape verified' }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
