import 'dotenv/config';
import fs from 'node:fs';
import { ensureLoggedContext } from './login.js';
import { INPUT_CANDIDATES, ASSISTANT_BUBBLE_CANDIDATES, POINTS_CANDIDATES } from './selectors.js';
import { sleep, readJSON, writeJSON, logSection, logInfo, logOk, logWarn, logErr } from './util.js';

const url = process.env.JUNE_CHAT_URL;
const storageState = process.env.STORAGE_STATE || './data/storageState.json';
const DAILY_MIN = Number(process.env.DAILY_MIN || 3);
const DAILY_MAX = Number(process.env.DAILY_MAX || 6);
const MIN_DELAY = Number(process.env.MIN_DELAY_MS || 45000);
const MAX_DELAY = Number(process.env.MAX_DELAY_MS || 120000);
const LOG_POINTS = String(process.env.LOG_POINTS || 'true') === 'true';

function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function pick(arr,n){ return arr.slice().sort(()=>Math.random()-0.5).slice(0,n); }

async function getInputLocator(page){
  for (const sel of INPUT_CANDIDATES) {
    const loc = page.locator(sel).first();
    if (await loc.count()) return loc;
  }
  throw new Error('Chat input not found');
}

async function getAssistantReply(page){
  for (const sel of ASSISTANT_BUBBLE_CANDIDATES) {
    const loc = page.locator(sel);
    if (await loc.count()) return (await loc.last().innerText()).trim();
  }
  // fallback: read entire page text (last resort)
  return (await page.textContent('body')).trim();
}

function parseNumber(s){
  if (!s) return null;
  const m = String(s).replace(/[,\s]/g,'').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

async function readPoints(page){
  // try dedicated elements
  for (const sel of POINTS_CANDIDATES) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      const txt = await loc.innerText();
      const n = parseNumber(txt);
      if (!Number.isNaN(n) && n !== null) return n;
    }
  }
  // broad search in header/sidebar
  const likely = await page.locator('header, [role="banner"], aside, [role="complementary"], [class*="header"], [class*="sidebar"]').allTextContents().catch(()=>[]);
  for (const t of likely) {
    if (/point|pts/i.test(t)) {
      const n = parseNumber(t);
      if (n !== null) return n;
    }
  }
  return null;
}

async function run(){
  logSection('June auto-bot');
  const prompts = JSON.parse(fs.readFileSync('./prompts.json','utf8'));
  const count = randInt(DAILY_MIN, DAILY_MAX);
  const batch = pick(prompts, count);

  const { browser, ctx, page } = await ensureLoggedContext();
  await page.goto(url, { waitUntil: 'networkidle' });

  // baseline points
  let baseline = LOG_POINTS ? (await readPoints(page)) : null;
  if (baseline !== null) logInfo(`Starting points: ${baseline}`);

  const input = await getInputLocator(page);
  const results = [];

  for (let i=0; i<batch.length; i++){
    const p = batch[i];
    logInfo(`Prompt ${i+1}/${batch.length}: ${p}`);
    await input.click();
    await input.fill(p);
    await page.keyboard.press('Enter');

    // wait for reply to render
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
    await page.waitForTimeout(1500);

    const reply = await getAssistantReply(page);

    let total = null, delta = null;
    if (LOG_POINTS) {
      total = await readPoints(page);
      if (total !== null && baseline !== null) delta = total - baseline;
      if (total !== null) baseline = total;
    }

    const rec = { prompt: p, reply, totalPoints: total, at: new Date().toISOString() };
    results.push(rec);

    // Pretty CLI line
    if (total !== null) {
      const deltaTxt = (delta !== null && !Number.isNaN(delta)) ? (delta >= 0 ? `+${delta}` : `${delta}`) : '±0';
      console.log(`→ Reply ok. Points ${deltaTxt}. Total ${total}.`);
    } else {
      console.log('→ Reply ok. (points not detected)');
    }

    // random delay between prompts
    const d = randInt(MIN_DELAY, MAX_DELAY);
    logInfo(`Sleeping ${Math.round(d/1000)}s…`);
    await sleep(d);
  }

  // Write daily log
  const day = new Date().toISOString().slice(0,10);
  const file = `./data/log-${day}.json`;
  writeJSON(file, results);
  logOk(`Saved ${results.length} interactions → ${file}`);

  await browser.close();
}

run().catch(e => {
  logErr(e.message || String(e));
  process.exit(1);
});
