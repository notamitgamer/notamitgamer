const path = require('path');
const express = require('express');
const { Resend } = require('resend');
const { Webhook } = require('svix');

const { db, admin } = require('./src/firebase');
const sse = require('./src/sseManager');

const app = express();
const port = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

// Optional: still ping your personal Gmail when mail arrives. If unset, this
// step is just skipped and the mailbox is the sole source of truth.
const personalGmail = process.env.PERSONAL_GMAIL;
const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS;

const mailsCollection = () => db.collection('mails');

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/incoming', express.text({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body;
    const headers = {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    };

    const wh = new Webhook(webhookSecret);
    let event;

    try {
      event = wh.verify(rawBody, headers);
    } catch (err) {
      console.error(err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (event.type !== 'email.received') {
      return res.status(200).json({ message: 'Not an email event' });
    }

    const emailData = event.data;
    const originalSender = emailData.from;
    const originalRecipient = (emailData.to && emailData.to[0] ? emailData.to[0] : '').toLowerCase();
    const subject = emailData.subject || 'No Subject';

    const allowedString = process.env.ALLOWED_ALIASES || '';
    const allowedAliases = allowedString.split(',').map(alias => alias.trim().toLowerCase()).filter(Boolean);

    if (allowedAliases.length && !allowedAliases.includes(originalRecipient)) {
      return res.status(200).json({ success: true, message: 'Alias ignored' });
    }

    // --- 1. Store the full email as a real mailbox entry ---
    const mailDoc = {
      from: originalSender,
      to: originalRecipient,
      subject,
      html: emailData.html || null,
      text: emailData.text || null,
      resendEmailId: emailData.email_id || null,
      read: false,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await mailsCollection().add(mailDoc);

    // Push live update to any open mailbox tab
    sse.broadcast('new_mail', {
      id: docRef.id,
      from: originalSender,
      to: originalRecipient,
      subject,
      receivedAt: Date.now(),
    });

    // --- 2. Optional: fire off a lightweight notification email ---
    if (personalGmail && forwardingAddress) {
      const notificationHtml = `
        <div style="font-family:Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e3e3e3;border-radius:16px;">
          <h2 style="margin:0 0 8px;">New mail in your inbox</h2>
          <p style="margin:0 0 4px;color:#444;"><strong>From:</strong> ${originalSender}</p>
          <p style="margin:0 0 16px;color:#444;"><strong>Subject:</strong> ${subject}</p>
          <p style="margin:0;color:#747775;font-size:13px;">Open your mailbox app to read the full message.</p>
        </div>`;

      const { error } = await resend.emails.send({
        from: `Notifier Bot <${forwardingAddress}>`,
        to: [personalGmail],
        reply_to: originalSender,
        subject: `New mail: ${subject}`,
        html: notificationHtml,
      });

      if (error) console.error('Notification send failed:', error.message);
    }

    return res.status(200).json({ success: true, id: docRef.id });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Mailbox API (public, no auth by design) ---

app.get('/api/mails', async (req, res) => {
  try {
    const snapshot = await mailsCollection().orderBy('receivedAt', 'desc').limit(100).get();
    const mails = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        from: d.from,
        to: d.to,
        subject: d.subject,
        read: d.read,
        receivedAt: d.receivedAt ? d.receivedAt.toMillis() : null,
      };
    });
    res.json({ mails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch mails' });
  }
});

app.get('/api/mails/:id', async (req, res) => {
  try {
    const doc = await mailsCollection().doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    doc.ref.update({ read: true }).catch(() => {});

    const d = doc.data();
    res.json({
      id: doc.id,
      from: d.from,
      to: d.to,
      subject: d.subject,
      html: d.html,
      text: d.text,
      read: true,
      receivedAt: d.receivedAt ? d.receivedAt.toMillis() : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch mail' });
  }
});

app.delete('/api/mails/:id', async (req, res) => {
  try {
    await mailsCollection().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete mail' });
  }
});

// --- Live updates ---
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sse.addClient(res);
});

app.get('/ping', (req, res) => {
  res.status(200).send('Server is awake!');
});

app.listen(port, () => {
  sse.startHeartbeat();
  console.log(`Mailbox server listening on port ${port}`);
});
