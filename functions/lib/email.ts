// nodemailer is a CommonJS module; use require to avoid TS6 namespace import issues
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer') as {
  createTransport: (opts: {
    service: string;
    auth: { user: string; pass: string };
  }) => {
    sendMail: (opts: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<unknown>;
  };
};

type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

// Email config from environment variables
const emailConfig = {
  user: process.env.EMAIL_USER ?? '',
  pass: process.env.EMAIL_PASS ?? '',
  from: process.env.EMAIL_FROM ?? 'StudentTrack <noreply@studenttrack.ng>',
};

export const getMailTransport = (): MailTransporter => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
  });
};

export const sendNotificationEmail = async (
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> => {
  if (!emailConfig.user || !emailConfig.pass) {
    console.log('Email not configured, skipping email notification');
    return;
  }

  try {
    const transport = getMailTransport();
    await transport.sendMail({
      from: emailConfig.from,
      to: toEmail,
      subject,
      html: htmlBody,
    });
    console.log('Email sent to:', toEmail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Email send failed:', message);
  }
};
