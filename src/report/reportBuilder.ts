import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import type { AssessmentResult, AssessmentSession } from '../types';

export async function buildReport(result: AssessmentResult, session: AssessmentSession): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'templates/report_template.html');
  const templateStr = fs.readFileSync(templatePath, 'utf-8');

  const template = handlebars.compile(templateStr);
  const html = template({ result, session });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
  });

  await browser.close();
  
  return Buffer.from(pdfBuffer);
}
