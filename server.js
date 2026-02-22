const express = require('express');
const { Resend } = require('resend');
const { Webhook } = require('svix');

const app = express();
const port = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

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
    const originalRecipient = emailData.to[0].toLowerCase();
    const subject = emailData.subject || 'No Subject';

    const allowedString = process.env.ALLOWED_ALIASES || '';
    const allowedAliases = allowedString.split(',').map(alias => alias.trim().toLowerCase());

    if (!allowedAliases.includes(originalRecipient)) {
      return res.status(200).json({ success: true, message: 'Alias ignored' });
    }

    const personalGmail = process.env.PERSONAL_GMAIL; 
    const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS; 

    const payload = {
      from: `Forwarder <${forwardingAddress}>`,
      to: [personalGmail],
      replyTo: originalSender, 
      subject: subject
    };

    if (emailData.html) {
      payload.html = emailData.html;
    }
    
    if (emailData.text) {
      payload.text = emailData.text;
    }

    if (!emailData.html && !emailData.text) {
      payload.text = 'No content found in the original email.';
    }

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, id: data?.id });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/ping', (req, res) => {
  res.status(200).send('Server is awake!');
});

app.listen(port, () => {
  console.log(`Email router listening on port ${port}`);
});
