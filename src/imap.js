import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export async function waitForOtp({
  host, port, secure, user, pass, fromFilter, subjectFilter, codeRegex, timeoutMs = 120000
}) {
  const client = new ImapFlow({ host, port: Number(port), secure: String(secure) === 'true', auth: { user, pass } });
  await client.connect();
  let lock;
  try {
    lock = await client.getMailboxLock('INBOX');
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const since = new Date(Date.now() - 15 * 60 * 1000);
      const uids = await client.search({ seen: false, since });
      for (const uid of uids.reverse()) {
        const { envelope, source } = await client.fetchOne(uid, { envelope: true, source: true });
        const fromStr = (envelope.from?.map(a => a.address || '').join(',') || '').toLowerCase();
        const subject = envelope.subject || '';
        if (fromFilter && !fromStr.includes(String(fromFilter).toLowerCase())) continue;
        if (subjectFilter && !subject.toLowerCase().includes(String(subjectFilter).toLowerCase())) continue;
        const parsed = await simpleParser(source);
        const text = (parsed.text || '') + '\n' + (parsed.html || '');
        const m = new RegExp(codeRegex || /\b(\d{6})\b/).exec(text);
        if (m) return m[1];
      }
      await new Promise(r => setTimeout(r, 5000));
      await client.mailboxRefresh();
    }
    throw new Error('OTP email not found within timeout');
  } finally {
    try { lock?.release(); } catch {}
    await client.logout().catch(()=>{});
  }
}
