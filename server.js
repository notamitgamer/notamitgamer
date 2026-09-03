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

    // Premium Adaptive Google-style HTML Template
    const notificationHtml = `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>New Email Notification</title>
  
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500&family=Roboto+Mono:wght@400;500&family=Roboto:wght@400;500&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .btn-pill:hover {
      opacity: 0.9;
      transform: translateY(-1px);
      transition: all 0.2s ease;
    }

    @media (prefers-color-scheme: dark) {
      .bg-outer { background-color: #131314 !important; }
      .bg-card { background-color: #1E1F20 !important; }
      .bg-tint { background-color: #282A2C !important; }
      .text-primary { color: #E3E3E3 !important; }
      .text-secondary { color: #C4C7C5 !important; }
      .text-accent { color: #A8C7FA !important; }
      .border-card { border-color: #444746 !important; }
      .divider { background-color: #444746 !important; }
      .btn-pill { 
        background-color: #A8C7FA !important; 
        color: #000000 !important; 
      }
      .icon-fill { fill: #8E918F !important; }
    }

    /* Gmail Dark Mode Fixes */
    [data-ogsb] .bg-outer { background-color: #131314 !important; }
    [data-ogsb] .bg-card { background-color: #1E1F20 !important; }
    [data-ogsb] .bg-tint { background-color: #282A2C !important; }
    [data-ogsc] .text-primary { color: #E3E3E3 !important; }
    [data-ogsc] .text-secondary { color: #C4C7C5 !important; }
    [data-ogsc] .text-accent { color: #A8C7FA !important; }
    [data-ogsb] .border-card { border-color: #444746 !important; }
    [data-ogsb] .divider { background-color: #444746 !important; }
    [data-ogsb] .btn-pill { background-color: #A8C7FA !important; }
    [data-ogsc] .btn-pill { color: #000000 !important; }
    [data-ogsc] .icon-fill { fill: #8E918F !important; }
  </style>
</head>

<body class="bg-outer" style="margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Google Sans', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <table width="100%" border="0" cellspacing="0" cellpadding="0" class="bg-outer" style="background-color: #F8F9FA; width: 100%; height: 100%;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        
        <table border="0" cellspacing="0" cellpadding="0" class="bg-card border-card" style="background-color: #FFFFFF; border-radius: 28px; max-width: 600px; width: 100%; overflow: hidden; border: 1px solid #C4C7C5;">
          
          <tr>
            <td style="padding: 40px 32px 16px 32px;">
              <h2 class="text-primary" style="margin: 0; font-family: 'Google Sans', Roboto, sans-serif; font-size: 22px; font-weight: 500; color: #1F1F1F; letter-spacing: -0.5px;">Incoming Message</h2>
              <p class="text-secondary" style="margin: 8px 0 0 0; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 400; color: #444746; line-height: 1.5;">A new email has been routed to your developer inbox.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 32px;">
              <div class="divider" style="height: 1px; background-color: #E3E3E3; width: 100%; margin: 16px 0;"></div>
            </td>
          </tr>

          <tr>
            <td style="padding: 16px 32px;">
              
              <div style="margin-bottom: 24px;">
                <span class="text-accent" style="display: block; font-family: Roboto, Arial, sans-serif; font-size: 11px; font-weight: 500; color: #0B57D0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Sender Email ID</span>
                <span class="text-primary" style="display: block; font-family: Roboto, Arial, sans-serif; font-size: 16px; font-weight: 400; color: #1F1F1F; word-break: break-all; line-height: 1.4;">${originalSender}</span>
              </div>

              <div style="margin-bottom: 24px;">
                <span class="text-accent" style="display: block; font-family: Roboto, Arial, sans-serif; font-size: 11px; font-weight: 500; color: #0B57D0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Subject</span>
                <span class="text-primary" style="display: block; font-family: 'Google Sans', Roboto, Arial, sans-serif; font-size: 18px; font-weight: 500; color: #1F1F1F; line-height: 1.4;">${subject}</span>
              </div>

              <div style="margin-bottom: 32px;">
                <span class="text-accent" style="display: block; font-family: Roboto, Arial, sans-serif; font-size: 11px; font-weight: 500; color: #0B57D0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Email Tracking ID</span>
                
                <table border="0" cellspacing="0" cellpadding="0" style="width: 100%;">
                  <tr>
                    <td class="bg-tint" style="background-color: #F0F4F9; border-radius: 8px; padding: 12px 16px;">
                      <span class="text-secondary" style="display: block; font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500; color: #444746; word-break: break-all;">
                        ${emailData.email_id || 'N/A'}
                      </span>
                    </td>
                  </tr>
                </table>
              </div>
              
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 32px 40px 32px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 100px;">
                    <a href="https://resend.com/emails/${emailData.email_id}" target="_blank" class="btn-pill" style="display: inline-block; padding: 12px 32px; background-color: #0B57D0; font-family: 'Google Sans', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; color: #FFFFFF; text-decoration: none; border-radius: 100px;">
                      Open Resend Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <table border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; margin-top: 32px;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <p class="text-secondary" style="margin: 0; font-family: Roboto, Arial, sans-serif; font-size: 12px; color: #747775; line-height: 1.6;">Automated alert by Notifier Bot.<br>Please do not reply to this unmonitored email.</p>
            </td>
          </tr>
          
          <tr>
            <td align="center" style="padding-bottom: 16px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="https://amit.is-a.dev" target="_blank" style="text-decoration: none;" title="Website">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#747775" class="icon-fill" xmlns="http://www.w3.org/2000/svg" style="display: block; border: 0;">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="https://github.com/notamitgamer" target="_blank" style="text-decoration: none;" title="GitHub">
                      <svg width="20" height="20" viewBox="0 0 16 16" fill="#747775" class="icon-fill" xmlns="http://www.w3.org/2000/svg" style="display: block; border: 0;">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                      </svg>
                    </a>
                  </td>
                  <td style="padding: 0 12px;">
                    <a href="mailto:amitdutta4255@gmail.com" style="text-decoration: none;" title="Email">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#747775" class="icon-fill" xmlns="http://www.w3.org/2000/svg" style="display: block; border: 0;">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center">
              <p class="text-secondary" style="margin: 0; font-family: Roboto, Arial, sans-serif; font-size: 12px; color: #747775;">
                &copy; 2025-2026 Amit Dutta &bull; <a href="https://amit.is-a.dev" class="text-secondary" style="color: #747775; text-decoration: none;">amit.is-a.dev</a>
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
      from: `Notifier Bot <${forwardingAddress}>`,
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
