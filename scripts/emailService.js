import nodemailer from "nodemailer";

const smtpHost = String(process.env.SMTP_HOST || "").trim();
const smtpPort = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10);
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || "");
const smtpSecure = String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true";
const mailFrom = String(process.env.MAIL_FROM || smtpUser).trim();
const appName = String(process.env.MAIL_APP_NAME || "LUCIA").trim() || "LUCIA";

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!smtpHost || !smtpUser || !smtpPassword || !mailFrom) {
    throw new Error("SMTP email service is not configured");
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 587,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPassword },
  });
  return transporter;
};

export const isEmailServiceConfigured = () =>
  Boolean(smtpHost && smtpUser && smtpPassword && mailFrom);

export const sendEmail = async ({ to, subject, text, html }) => {
  const recipient = String(to || "").trim();
  if (!recipient) throw new Error("Email recipient is required");

  return getTransporter().sendMail({
    from: mailFrom,
    to: recipient,
    subject: String(subject || `${appName} notification`),
    text: String(text || ""),
    html: String(html || ""),
  });
};

export const sendTemporaryPasswordEmail = async (email, temporaryPassword) => {
  const recipient = String(email || "").trim();
  const password = String(temporaryPassword || "");
  const subject = `${appName}: тимчасовий пароль`;
  const text = [
    `Для вашого облікового запису ${appName} створено тимчасовий пароль.`,
    "",
    `Тимчасовий пароль: ${password}`,
    "",
    "Увійдіть у систему та одразу змініть цей пароль у профілі.",
    "Якщо ви не запитували відновлення, зверніться до адміністратора платформи.",
  ].join("\n");

  return sendEmail({
    to: recipient,
    subject,
    text,
    html: `<p>Для вашого облікового запису <strong>${appName}</strong> створено тимчасовий пароль.</p><p><strong>Тимчасовий пароль:</strong> ${password}</p><p>Увійдіть у систему та одразу змініть цей пароль у профілі.</p><p>Якщо ви не запитували відновлення, зверніться до адміністратора платформи.</p>`,
  });
};
