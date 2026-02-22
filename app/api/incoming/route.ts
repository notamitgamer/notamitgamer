import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { Webhook } from 'svix';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Webhook secret from Resend Dashboard -> Webhooks
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET as string;

export async function POST(req: NextRequest) {
  try {
    // 1. Get raw body and headers for Svix verification
    const rawBody = await req.text();
    const headers = {
      'svix-id': req.headers.get('svix-id') as string,
      'svix-timestamp': req.headers.get('svix-timestamp') as string,
      'svix-signature': req.headers.get('svix-signature') as string,
    };

    // 2. Verify Signature to prevent spam/abuse
    const wh = new Webhook(webhookSecret);
    let event;
    
    try {
      event = wh.verify(rawBody, headers) as any;
    } catch (err) {
      console.error('Webhook signature verification failed.', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // 3. Ensure it's the right event
    if (event.type !== 'email.received') {
      return NextResponse.json({ message: 'Not an email event' });
    }

    // 4. Extract data
    const emailData = event.data;
    const originalSender = emailData.from;
    const originalRecipient = emailData.to[0].toLowerCase(); // e.g., admin@amit.is-a.dev
    const subject = emailData.subject || 'No Subject';

    // 5. Quota Protection (The Bouncer)
    // Only forward emails sent to your approved addresses
    const allowedString = process.env.ALLOWED_ALIASES || '';
    const allowedAliases = allowedString.split(',').map(alias => alias.trim().toLowerCase());

    if (!allowedAliases.includes(originalRecipient)) {
      console.log(`Blocked email to unapproved alias: ${originalRecipient}`);
      // Return 200 OK so Resend doesn't retry, but we do not forward it
      return NextResponse.json({ success: true, message: 'Alias ignored' });
    }

    // 6. Forwarding Setup
    const personalGmail = process.env.PERSONAL_GMAIL as string; 
    const forwardingAddress = process.env.FORWARDING_BOT_ADDRESS as string; // Must be verified in Resend (e.g. bot@amit.is-a.dev)

    // 7. Send the forwarded email
    const { data, error } = await resend.emails.send({
      from: `Dev Inbox <${forwardingAddress}>`,
      to: [personalGmail],
      replyTo: originalSender, // When you click 'Reply' in Gmail, it goes to the original sender
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });

  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
