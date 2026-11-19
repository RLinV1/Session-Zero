import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface EmailVerification {
  mailer: Mailer;
}

const REQUIRED = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Email verification needs mail settings in production; missing ${missing.join(", ")}`);
  }
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT must be a port number such as 465, not "${env.SMTP_PORT}"`);
  }
  return {
    host: env.SMTP_HOST!.trim(),
    port,
    user: env.SMTP_USER!.trim(),
    pass: env.SMTP_PASS!,
    from: env.MAIL_FROM!.trim(),
  };
}

export function smtpMailer(config: MailConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message, to: { name: "", address: message.to } });
    },
  };
}

export function verificationRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function verificationFromEnv(env: NodeJS.ProcessEnv = process.env): EmailVerification | null {
  if (!verificationRequired(env)) return null;
  return { mailer: smtpMailer(mailConfigFromEnv(env)) };
}
