const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  await page.evaluate(async () => {
    const pdfjsLib = await import('pdfjs-dist');
    console.log('Version is:', pdfjsLib.version);
    console.log('GlobalWorkerOptions is:', typeof pdfjsLib.GlobalWorkerOptions);
  });
  
  await new Promise(r => setTimeout(r, 500));
  await browser.close();
})();
