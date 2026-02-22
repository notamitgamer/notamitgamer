const express = require('express');
const { Resend } = require('resend');
const { Webhook } = require('svix');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

// We use express.text to get the raw string body needed for Svix verification
app.post('/api/incoming', express.text({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body;
    const headers = {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    };

    // 1. Verify Signature to prevent spam/abuse
    const wh = new Webhook(webhookSecret);
    let event;
    
    try {
      event = wh.verify(rawBody, headers);
    } catch (err) {
      console.error('Webhook signature verification failed.', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // 2. Ensure it's the right event
    if (event.type !== 'email.received') {
      return res.status(200).json({ message: 'Not an email event' });
    }

    // 3. Extract data
    const emailData = event.data;
    const originalSender = emailData.from;
    const originalRecipient = emailData.to[0].toLowerCase(); // e.g., admin@amit.is-a.dev
    const subject = emailData.subject || 'No Subject';

    // 4. Quota Protection (The Bouncer)
    const allowedString = process.env.ALLOWED_ALIASES || '';
    const allowedAliases = allowedString.split(',').map(alias => alias.trim().toLowerCase());

    if (!allowedAliases.includes(originalRecipient)) {
      console.log(`Blocked email to unapproved alias: ${originalRecipient}`);
      // Return 200 OK so Resend doesn't retry
      return res.status(200).json({ success: true, message: 'Alias ignored' });
    }

    // 5. Forwarding Setup
    const personalGmail = process.env.PERSONAL_GMAIL; 
    const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS; 

    // 6. Send the forwarded email
    const { data, error } = await resend.emails.send({
      from: `Dev Inbox <${forwardingAddress}>`,
      to: [personalGmail],
      replyTo: originalSender, 
      subject: `[${originalRecipient.split('@')[0]}] ${subject}`,
      html: `
        <div style="background-color: #f3f4f6; padding: 12px; margin-bottom: 20px; border-radius: 6px; font-family: sans-serif; font-size: 14px; color: #374151;">
          <strong>From:</strong> ${originalSender}<br>
          <strong>To:</strong> ${originalRecipient}
        </div>
        ${emailData.html || `<p>${emailData.text}</p>` || '<p>No content.</p>'}
      `,
      text: `From: ${originalSender}\nTo: ${originalRecipient}\n\n${emailData.text || 'No content.'}`,
    });

    if (error) {
      console.error('Resend forward failed:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`Successfully forwarded email to ${personalGmail}`);
    return res.status(200).json({ success: true, id: data?.id });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- UPTIMEROBOT PING ROUTE ---
// Point UptimeRobot to https://your-render-url.onrender.com/ping
app.get('/ping', (req, res) => {
  res.status(200).send('Server is awake!');
});

app.listen(port, () => {
  console.log(`Email router listening on port ${port}`);
});