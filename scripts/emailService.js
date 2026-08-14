import nodemailer from "nodemailer";

const getConfig = (override = {}) => ({
  host: String(override.host || process.env.SMTP_HOST || "").trim(),
  port: Number.parseInt(String(override.port || process.env.SMTP_PORT || "587"), 10),
  user: String(override.user || process.env.SMTP_USER || "").trim(),
  password: String(override.password ?? process.env.SMTP_PASSWORD ?? ""),
  secure: String(override.secure ?? process.env.SMTP_SECURE ?? "false").trim().toLowerCase() === "true",
  from: String(override.from || process.env.MAIL_FROM || override.user || process.env.SMTP_USER || "").trim(),
});

const getTransporter = (config) => {
  if (!config.host || !config.user || !config.password || !config.from) {
    throw new Error("SMTP email service is not configured");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: Number.isFinite(config.port) ? config.port : 587,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
};

export const isEmailServiceConfigured = (override = {}) => {
  const config = getConfig(override);
  return Boolean(config.host && config.user && config.password && config.from);
};

export const sendEmail = async ({ to, subject, text, html, smtp }) => {
  const recipient = String(to || "").trim();
  if (!recipient) throw new Error("Email recipient is required");

  const config = getConfig(smtp);
  return getTransporter(config).sendMail({
    from: config.from,
    to: recipient,
    subject: String(subject || `${appName} notification`),
    text: String(text || ""),
    html: String(html || ""),
  });
};

export const sendTemporaryPasswordEmail = async (email, temporaryPassword, smtp) => {
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
    smtp,
  });
};
