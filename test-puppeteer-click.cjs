const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // Click the AI button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.innerText.includes('Auto PDF'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Upload a dummy pdf
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    console.log('Uploading file...');
    const fs = require('fs');
    fs.writeFileSync('dummy.pdf', 'dummy content');
    await fileInput.uploadFile('dummy.pdf');
    await new Promise(r => setTimeout(r, 500));
    
    // Click Process
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.innerText.includes('Convert to CBT ZIP'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await browser.close();
})();
