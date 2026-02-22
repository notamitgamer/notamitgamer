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

    // --- NEW FALLBACK LOGIC ---
    // If Resend's webhook drops the body, we actively fetch it from their API
    let htmlBody = emailData.html;
    let textBody = emailData.text;

    if (!htmlBody && !textBody && emailData.email_id) {
      try {
        console.log(`Body missing in webhook. Fetching email ${emailData.email_id} via API...`);
        
        // FIX: Use 'receiving.get' instead of 'get' for fetching inbound emails
        const fetchedResponse = await resend.emails.receiving.get(emailData.email_id); 
        
        if (fetchedResponse && fetchedResponse.data) {
          htmlBody = fetchedResponse.data.html;
          textBody = fetchedResponse.data.text;
        }
      } catch (fetchError) {
        console.error("Could not fetch email explicitly:", fetchError.message);
      }
    }
    // ---------------------------

    const personalGmail = process.env.PERSONAL_GMAIL; 
    const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS; 

    const payload = {
      from: `Forwarder <${forwardingAddress}>`,
      to: [personalGmail],
      reply_to: originalSender, // FIX: Strictly match Resend API property name
      subject: subject
    };

    const hasHtml = htmlBody && htmlBody.trim().length > 0;
    const hasText = textBody && textBody.trim().length > 0;

    if (hasHtml) {
      payload.html = htmlBody;
    }
    
    if (hasText) {
      payload.text = textBody;
    }

    if (!hasHtml && !hasText) {
      payload.text = "DIAGNOSTIC MODE: Resend's Webhook AND API failed to return any text or HTML for this email.\n\n" +
                     "If this continues happening with standard Gmail messages, Resend's inbound parser may be dropping your text.\n\n" +
                     "Raw Webhook Data:\n" + JSON.stringify(emailData, null, 2);
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
