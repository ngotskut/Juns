import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJSON(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

export function logSection(title) {
  const line = '─'.repeat(Math.max(8, title.length));
  console.log(chalk.gray('\n' + line));
  console.log(chalk.bold(title));
  console.log(chalk.gray(line));
}

export function logInfo(s) { console.log(chalk.cyan('ℹ︎ ' + s)); }
export function logOk(s) { console.log(chalk.green('✔ ' + s)); }
export function logWarn(s) { console.log(chalk.yellow('⚠ ' + s)); }
export function logErr(s) { console.log(chalk.red('✖ ' + s)); }
