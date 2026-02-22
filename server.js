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
    let htmlBody = emailData.html;
    let textBody = emailData.text;

    if (!htmlBody && !textBody && emailData.email_id) {
      try {
        console.log(`Body missing in webhook. Waiting 2 seconds for Resend DB sync...`);
        
        // Fix: Add a 2-second delay to overcome Resend's eventual consistency (race condition)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`Fetching email ${emailData.email_id} via API...`);
        
        // Fix: Correct SDK method and proper destructuring
        const { data: fetchedEmail, error: fetchError } = await resend.emails.get(emailData.email_id); 
        
        if (fetchError) {
          console.error("API Error explicitly fetching email:", fetchError);
        } else if (fetchedEmail) {
          htmlBody = fetchedEmail.html;
          textBody = fetchedEmail.text;
          console.log("Successfully recovered email body from API.");
        }
      } catch (fetchException) {
        console.error("Exception fetching email explicitly:", fetchException.message);
      }
    }
    // ---------------------------

    const personalGmail = process.env.PERSONAL_GMAIL; 
    const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS; 

    const payload = {
      from: `Forwarder <${forwardingAddress}>`,
      to: [personalGmail],
      reply_to: originalSender, 
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

    // Cleaner fallback if it still can't find the body
    if (!hasHtml && !hasText) {
      payload.text = `Email body was missing from the webhook and could not be fetched from the Resend API.\n\n` +
                     `Sender: ${originalSender}\n` +
                     `You can view this email directly in your Resend Dashboard:\n` +
                     `https://resend.com/emails/${emailData.email_id}`;
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
