import nodemailer, { type Transporter } from 'nodemailer';

interface SendCredentialsParams {
  to: string;
  name: string;
  role: 'student' | 'faculty' | 'college_admin';
  username?: string; // studentId or facultyId or email
  loginId?: string;
  password: string;
  collegeName?: string;
  collegeCode?: string;
  loginUrl?: string;
}

interface SendResetOtpParams {
  to: string;
  name: string;
  otp: string;
  role: string;
  expiresInMinutes?: number;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey = '';

// Dynamically build transport based on latest environment variables
export function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || process.env.SMTP_EMAIL)?.trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)?.trim();
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS)?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();

  const currentKey = `${host}:${port}:${user}:${pass ? '***' : ''}:${gmailUser}:${gmailPass ? '***' : ''}:${resendKey ? '***' : ''}`;

  if (cachedTransporter && cachedConfigKey === currentKey) {
    return cachedTransporter;
  }

  // 1. Gmail App Password configuration
  if (gmailUser && gmailPass) {
    console.log(`[Email Service] Initializing Gmail SMTP transport for ${gmailUser}`);
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass.replace(/\s+/g, ''), // Strip spaces from 16-char app passwords
      },
    });
    cachedConfigKey = currentKey;
    return cachedTransporter;
  }

  // 2. Resend SMTP configuration
  if (resendKey) {
    console.log('[Email Service] Initializing Resend SMTP transport');
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: resendKey,
      },
    });
    cachedConfigKey = currentKey;
    return cachedTransporter;
  }

  // 3. Generic Custom SMTP (Brevo, SendGrid, Mailgun, Amazon SES, or custom server)
  if (host && user && pass) {
    console.log(`[Email Service] Initializing SMTP transport on ${host}:${port}`);
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465 || process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
      },
    });
    cachedConfigKey = currentKey;
    return cachedTransporter;
  }

  cachedTransporter = null;
  cachedConfigKey = '';
  return null;
}

export function getFromAddress(): string {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM.trim();
  if (process.env.GMAIL_USER) return process.env.GMAIL_USER.trim();
  if (process.env.SMTP_USER) return process.env.SMTP_USER.trim();
  return 'no-reply@campus.erus.edu';
}

export async function verifyEmailConfiguration(): Promise<{
  active: boolean;
  provider?: string;
  from?: string;
  error?: string;
}> {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      active: false,
      error: 'No email credentials configured. Please set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_HOST + SMTP_USER + SMTP_PASS.',
    };
  }

  try {
    await transporter.verify();
    let provider = 'Custom SMTP';
    if (process.env.GMAIL_USER) provider = 'Google Gmail';
    else if (process.env.RESEND_API_KEY) provider = 'Resend';
    else if (process.env.SMTP_HOST?.includes('brevo') || process.env.SMTP_HOST?.includes('sendinblue')) provider = 'Brevo';
    else if (process.env.SMTP_HOST?.includes('sendgrid')) provider = 'SendGrid';

    return {
      active: true,
      provider,
      from: getFromAddress(),
    };
  } catch (err: any) {
    return {
      active: false,
      error: `SMTP Verification failed: ${err.message || err}`,
    };
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      success: false,
      message: 'SMTP credentials missing. Configure GMAIL_USER + GMAIL_APP_PASSWORD or SMTP variables in .env.',
    };
  }

  try {
    const fromAddr = getFromAddress();
    await transporter.sendMail({
      from: `"ERUS Platform" <${fromAddr}>`,
      to: toEmail,
      subject: 'ERUS Platform - Live Email Integration Test',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
          <h2 style="color: #0f172a; margin-top: 0;">🎉 Real Email Delivery Verified</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            This email confirms that your outgoing mail server is properly connected and functioning. All system emails, including student credentials, observer assignments, and password reset OTPs, will now be delivered live to actual recipient inboxes.
          </p>
          <div style="background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 12px; color: #64748b; font-family: monospace;">
            Sender: ${fromAddr}<br>
            Timestamp: ${new Date().toISOString()}
          </div>
        </div>
      `,
    });
    return { success: true, message: `Live test email successfully delivered to ${toEmail}` };
  } catch (err: any) {
    return { success: false, message: 'Failed to deliver test email', error: err.message };
  }
}

export async function sendCredentialsEmail(params: SendCredentialsParams): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const { to, name, role, username, loginId, password, collegeName = 'Your Institution', loginUrl = 'https://erus-production.up.railway.app' } = params;
  const roleTitle = role === 'faculty' ? 'Faculty Evaluator' : role === 'college_admin' ? 'College Administrator' : 'Student Participant';
  const roleColor = role === 'faculty' ? '#0d9488' : role === 'college_admin' ? '#d97706' : '#2563eb';
  const userIdentifier = username || loginId || to;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your ERUS Portal Login Credentials</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 28px; text-align: center; color: #ffffff; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: ${roleColor}; color: white; margin-bottom: 12px; }
        .title { margin: 0; font-size: 22px; font-weight: 700; }
        .subtitle { margin-top: 6px; font-size: 13px; color: #94a3b8; }
        .body-content { padding: 32px 28px; }
        .greeting { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
        .desc { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .creds-box { background: #f1f5f9; border-radius: 12px; padding: 20px; border: 1px solid #cbd5e1; margin-bottom: 24px; }
        .cred-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
        .cred-row:last-child { margin-bottom: 0; }
        .cred-label { font-weight: 600; color: #64748b; }
        .cred-val { font-family: monospace; font-weight: 700; color: #0f172a; background: #e2e8f0; padding: 2px 8px; border-radius: 6px; }
        .btn-container { text-align: center; margin: 28px 0; }
        .btn { display: inline-block; background: ${roleColor}; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="badge">${roleTitle}</div>
          <h1 class="title">ERUS AI Group Discussion Platform</h1>
          <div class="subtitle">Access Credentials Issued by ${collegeName}</div>
        </div>
        <div class="body-content">
          <div class="greeting">Hello, ${name}</div>
          <p class="desc">
            Your official <strong>${roleTitle}</strong> account for the ERUS AI Group Discussion & Evaluation Platform is ready.
          </p>
          <div class="creds-box">
            <div class="cred-row">
              <span class="cred-label">Login Identifier / Email:</span>
              <span class="cred-val">${to}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Username / Roll No:</span>
              <span class="cred-val">${userIdentifier}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Assigned Password:</span>
              <span class="cred-val">${password}</span>
            </div>
          </div>
          <p class="desc" style="font-size: 13px; color: #64748b;">
            💡 Note: You can reset this password anytime using your registered email via the "Forgot Password" link on the login screen.
          </p>
          <div class="btn-container">
            <a href="${loginUrl}" class="btn" target="_blank">Sign In to ERUS Portal</a>
          </div>
        </div>
        <div class="footer">
          This is an automated dispatch from ERUS Platform. If you did not expect this email, please contact your campus administration.
        </div>
      </div>
    </body>
    </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email Service - Simulated] Credentials sent to ${to} (${name}): Username=${userIdentifier}, Password=${password}`);
    return { success: true, simulated: true };
  }

  try {
    const fromAddress = getFromAddress();
    await transporter.sendMail({
      from: `"ERUS Platform" <${fromAddress}>`,
      to,
      subject: `Your ${collegeName} ERUS Portal Login Credentials`,
      html,
    });
    console.log(`[Email Service - Live] Successfully delivered credentials email to ${to}`);
    return { success: true, simulated: false };
  } catch (err: any) {
    console.warn(`[Email Service] Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function sendPasswordResetOtpEmail(params: SendResetOtpParams): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const { to, name, otp, role, expiresInMinutes = 15 } = params;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Password Reset Request</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: #0f172a; padding: 28px; text-align: center; color: #ffffff; }
        .title { margin: 0; font-size: 20px; font-weight: 700; }
        .body-content { padding: 32px 28px; text-align: center; }
        .desc { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; text-align: left; }
        .otp-box { background: #f8fafc; border: 2px dashed #6366f1; border-radius: 12px; padding: 18px; margin: 24px 0; text-align: center; }
        .otp-code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4338ca; }
        .expiry { font-size: 12px; color: #dc2626; font-weight: 600; margin-top: 8px; }
        .footer { padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="title">ERUS Account Security</h1>
        </div>
        <div class="body-content">
          <p class="desc">
            Hello ${name || 'User'},<br><br>
            We received a request to reset the password for your <strong>${role}</strong> account associated with ${to}. Use the verification code below to set a new password:
          </p>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry">Expires in ${expiresInMinutes} minutes</div>
          </div>
          <p class="desc" style="font-size: 13px; color: #64748b;">
            If you did not request a password reset, you can safely ignore this email. Your current password remains active and secure.
          </p>
        </div>
        <div class="footer">
          ERUS Group Discussion Platform &bull; Security & Verification
        </div>
      </div>
    </body>
    </html>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email Service - Simulated] Password reset OTP sent to ${to}: Code=${otp} (expires in ${expiresInMinutes}m)`);
    return { success: true, simulated: true };
  }

  try {
    const fromAddress = getFromAddress();
    await transporter.sendMail({
      from: `"ERUS Security" <${fromAddress}>`,
      to,
      subject: `Your ERUS Password Reset Code: ${otp}`,
      html,
    });
    console.log(`[Email Service - Live] Successfully delivered OTP email to ${to}`);
    return { success: true, simulated: false };
  } catch (err: any) {
    console.warn(`[Email Service] Failed to send OTP email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}
