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

    // HTML Template injected with real data
    const notificationHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Email Notification</title>
  <!-- Fallback styles for older email clients -->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Roboto:wght@400;500&display=swap');
    body {
      margin: 0;
      padding: 0;
      background-color: #131314;
      font-family: 'Google Sans', Roboto, Helvetica, Arial, sans-serif;
      color: #E3E3E3;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #131314; font-family: 'Google Sans', Roboto, Helvetica, Arial, sans-serif; color: #E3E3E3;">

  <!-- Outer Wrapper to ensure dark background in all clients -->
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #131314; width: 100%; height: 100%;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- M3 Surface Container (The Card) -->
        <table border="0" cellspacing="0" cellpadding="0" style="background-color: #1E1F20; border-radius: 28px; max-width: 600px; width: 100%; overflow: hidden; border: 1px solid #444746;">
          
          <!-- Header Area -->
          <tr>
            <td style="padding: 32px 32px 16px 32px;">
              <h2 style="margin: 0; font-size: 22px; font-weight: 500; color: #E3E3E3;">Incoming Message</h2>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #C4C7C5;">A new email has been routed to your developer inbox.</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #444746; width: 100%; margin: 16px 0;"></div>
            </td>
          </tr>

          <!-- Data Fields -->
          <tr>
            <td style="padding: 16px 32px;">
              <!-- Field: Sender -->
              <div style="margin-bottom: 24px;">
                <span style="display: block; font-size: 12px; font-weight: 500; color: #A8C7FA; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Sender Email ID</span>
                <span style="display: block; font-size: 16px; color: #E3E3E3; word-break: break-all;">${originalSender}</span>
              </div>

              <!-- Field: Subject -->
              <div style="margin-bottom: 24px;">
                <span style="display: block; font-size: 12px; font-weight: 500; color: #A8C7FA; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Subject</span>
                <span style="display: block; font-size: 18px; color: #E3E3E3; font-weight: 500; line-height: 1.4;">${subject}</span>
              </div>

              <!-- Field: Email ID -->
              <div style="margin-bottom: 32px;">
                <span style="display: block; font-size: 12px; font-weight: 500; color: #A8C7FA; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Email_ID</span>
                <span style="display: block; font-size: 14px; color: #C4C7C5; font-family: monospace;">${emailData.email_id || 'N/A'}</span>
              </div>
            </td>
          </tr>

          <!-- Action Button Area -->
          <tr>
            <td style="padding: 0 32px 40px 32px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 100px; background-color: #A8C7FA;">
                    <!-- M3 Filled Button -->
                    <a href="https://resend.com/emails/${emailData.email_id}" target="_blank" style="display: inline-block; padding: 12px 28px; font-family: 'Google Sans', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; color: #000000; text-decoration: none; border-radius: 100px;">
                      Open Resend Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; margin-top: 24px;">
          <!-- Warning Text -->
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <p style="margin: 0; font-size: 12px; color: #8E918F; line-height: 1.5;">Automated alert by Notifier Bot.<br>Please do not reply to this unmonitored email.</p>
            </td>
          </tr>
          
          <!-- Social Icons -->
          <tr>
            <td align="center" style="padding-bottom: 16px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="https://amit.is-a.dev" target="_blank" style="text-decoration: none;" title="Website">
                      <img src="https://img.icons8.com/ios-filled/24/8E918F/domain.png" alt="Website" width="20" height="20" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://github.com/notamitgamer" target="_blank" style="text-decoration: none;" title="GitHub">
                      <svg height="20" viewBox="0 0 16 16" width="20" fill="#8E918F" xmlns="http://www.w3.org/2000/svg" style="display: block; border: 0;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="mailto:amitdutta4255@gmail.com" style="text-decoration: none;" title="Email">
                      <img src="https://img.icons8.com/ios-filled/24/8E918F/mail.png" alt="Email" width="20" height="20" style="display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Copyright Text -->
          <tr>
            <td align="center">
              <p style="margin: 0; font-size: 12px; color: #8E918F;">
                &copy; 2025-2026 Amit Dutta &bull; <a href="https://amit.is-a.dev" style="color: #8E918F; text-decoration: none;">amit.is-a.dev</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `;

    const payload = {
      from: `Forwarder <${forwardingAddress}>`,
      to: [personalGmail],
      reply_to: originalSender, 
      subject: subject,
      html: notificationHtml
    };

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
