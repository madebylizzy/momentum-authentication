import { createTransport, type Transporter } from 'nodemailer';

const GMAIL_HOST = 'smtp.gmail.com';
const GMAIL_PORT = 465;

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!gmailUser || !gmailAppPassword) {
    return null;
  }
  if (!transporter) {
    transporter = createTransport({
      host: GMAIL_HOST,
      port: GMAIL_PORT,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
  }
  return transporter;
}

function logToConsole(subject: string, to: string, body: string): void {
  console.log('\n======================================================');
  console.log(`[MOMENTUM EMAIL] ${subject} for ${to}`);
  console.log(body);
  console.log('======================================================\n');
}

async function deliver(
  subject: string,
  to: string,
  text: string,
  consoleLabel: string
): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[MOMENTUM EMAIL] GMAIL_USER/GMAIL_APP_PASSWORD not set — falling back to console.`);
    logToConsole(consoleLabel, to, text);
    return;
  }

  try {
    await transport.sendMail({
      from: `"Momentum Authentication" <${gmailUser}>`,
      to,
      subject,
      text,
    });
    console.log(`[MOMENTUM EMAIL] ${subject} delivered by Gmail SMTP to ${to}`);
  } catch (error) {
    console.error(`[MOMENTUM EMAIL] Gmail SMTP delivery to ${to} failed:`, error);
    throw error;
  }
}

export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  expiresAt: Date
): Promise<void> {
  const text = [
    `Your Momentum verification code is ${code}.`,
    '',
    `It expires at ${expiresAt.toISOString()}.`,
    '',
    'If you did not request this code, you can ignore this email.',
  ].join('\n');

  await deliver('Your Momentum verification code', to, text, 'Verification Code');
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  expiresAt: Date
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const text = [
    'You requested a password reset for your Momentum account.',
    '',
    `Reset your password here: ${resetUrl}`,
    '',
    `This link expires at ${expiresAt.toISOString()}.`,
    '',
    'If you did not request a password reset, you can ignore this email. No changes were made.',
  ].join('\n');

  await deliver('Reset your Momentum password', to, text, 'Password Reset Link');
}