import { chromium } from 'playwright';
import fs from 'node:fs';
import 'dotenv/config';
import { waitForOtp } from './imap.js';
import { INPUT_CANDIDATES } from './selectors.js';
import { logInfo, logOk, logWarn } from './util.js';

const url = process.env.JUNE_CHAT_URL;
const storagePath = process.env.STORAGE_STATE || './data/storageState.json';

export async function ensureLoggedContext() {
  // If storage exists, try reuse it first
  if (fs.existsSync(storagePath)) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: storagePath });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      // if input is present, we are already logged in
      for (const sel of INPUT_CANDIDATES) {
        if (await page.locator(sel).count()) {
          logOk('Reuse existing session');
          return { browser, ctx, page, reused: true };
        }
      }
    } catch (e) {
      logWarn('Stored session invalid, will login fresh');
    }
    await browser.close();
  }

  // Fresh login (assumes email-based code)
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // Click Sign in / Continue with email (best-effort)
  const candidates = [
    'button:has-text("Sign in")', 'button:has-text("Log in")', 'text=Sign in', 'text=Log in',
    'button:has-text("Continue with email")', 'text=Continue with email',
    'text=Masuk', 'text=Login'
  ];
  for (const c of candidates) {
    try { if (await page.locator(c).first().isVisible()) { await page.locator(c).first().click(); break; } } catch {}
  }

  // Fill email
  const emailSel = 'input[type="email"], [name*="email" i], input[autocomplete="email"]';
  await page.waitForSelector(emailSel, { timeout: 20000 });
  const email = process.env.IMAP_USER;
  if (!email) throw new Error('IMAP_USER (your login email) is required');
  await page.fill(emailSel, email);

  // Continue / Send code
  const contBtn = page.locator('button:has-text("Continue"), button:has-text("Send code"), button:has-text("Next")').first();
  try { await contBtn.click(); } catch {}

  // Wait for code inputs (single or segmented)
  // Meanwhile fetch OTP via IMAP
  logInfo('Waiting for OTP via IMAP…');
  const code = await waitForOtp({
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    secure: process.env.IMAP_SECURE,
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
    fromFilter: process.env.IMAP_FROM,
    subjectFilter: process.env.IMAP_SUBJECT,
    codeRegex: process.env.OTP_REGEX,
    timeoutMs: Number(process.env.OTP_TIMEOUT_MS || 120000)
  });
  logOk('Got OTP code');

  // Try to fill segmented inputs first
  const codeInputs = page.locator('input[autocomplete="one-time-code"], input[aria-label*="code" i], input[name*="code" i], input[type="tel"]');
  const count = await codeInputs.count();
  if (count >= 4 && count <= 8) {
    for (let i = 0; i < Math.min(code.length, count); i++) {
      await codeInputs.nth(i).fill(code[i]);
    }
  } else {
    // fallback to a single input
    const single = page.locator('input[type="text"], input[type="tel"], input[name*="code" i]');
    await single.first().fill(code);
  }

  // Submit
  const submitBtn = page.locator('button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
  try { await submitBtn.click({ timeout: 5000 }); } catch {}

  // Wait for chat box to appear
  await page.waitForLoadState('networkidle');
  // save storage
  await ctx.storageState({ path: storagePath });
  logOk('New session saved');

  return { browser, ctx, page, reused: false };
}
