/**
 * One-off backfill: pulls every email Resend has already received
 * (visible in the Resend dashboard under Emails > Receiving) and stores
 * it in Firestore using the same schema server.js writes on new mail.
 *
 * Resend keeps a log of received emails independent of your webhook, so
 * this recovers everything that arrived before this mailbox existed.
 *
 * Usage (from the repo root, with deps installed):
 *   RESEND_API_KEY=re_xxx FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/backfill-from-resend.js
 *
 * Safe to re-run: emails are stored under a deterministic Firestore doc ID
 * derived from the Resend email ID, so re-running just overwrites the same
 * docs instead of duplicating them.
 */

const { Resend } = require('resend');
const { db } = require('../src/firebase');

const resend = new Resend(process.env.RESEND_API_KEY);
const mailsCollection = db.collection('mails');

async function backfill() {
  if (!process.env.RESEND_API_KEY) {
    console.error('Set RESEND_API_KEY before running this script.');
    process.exit(1);
  }

  let cursor;
  let total = 0;
  let page = 0;

  do {
    page += 1;
    const { data, error } = await resend.emails.receiving.list(
      cursor ? { before: cursor } : undefined
    );

    if (error) {
      console.error('Failed to list received emails:', error.message);
      process.exit(1);
    }

    const items = data?.data || [];
    console.log(`Page ${page}: ${items.length} emails`);

    for (const summary of items) {
      const { data: full, error: getError } = await resend.emails.receiving.get(summary.id);
      if (getError) {
        console.error(`Skipping ${summary.id}: ${getError.message}`);
        continue;
      }

      const docId = `resend_${summary.id}`;
      await mailsCollection.doc(docId).set({
        from: full.from,
        to: (full.to && full.to[0]) ? full.to[0].toLowerCase() : '',
        subject: full.subject || 'No Subject',
        html: full.html || null,
        text: full.text || null,
        resendEmailId: full.id,
        read: true, // treat backfilled mail as already-seen
        receivedAt: full.created_at ? new Date(full.created_at) : new Date(),
        backfilled: true,
      }, { merge: true });

      total += 1;
      process.stdout.write(`  stored ${full.subject || '(no subject)'}\n`);
    }

    cursor = data?.has_more ? items[items.length - 1]?.id : null;
  } while (cursor);

  console.log(`\nDone. Backfilled ${total} email(s) into Firestore.`);
  console.log('Restart the server (or wait for its next cold start) to pick these up in the list cache.');
  process.exit(0);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
