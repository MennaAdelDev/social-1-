const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

async function sendMail({ to, subject, text, html }) {
  await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
  if (!env.SMTP_HOST) console.log(`\n[DEV EMAIL] to=${to}\nsubject=${subject}\n${text}\n`);
}

exports.sendVerificationEmail = (user, token) => {
  const link = `${env.API_URL}/api/v1/auth/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Verify your email',
    text: `Hi ${user.name}, verify your email (valid for 24h): ${link}`,
    html: `<p>Hi ${user.name},</p><p>Verify your email (valid for 24 hours):</p><p><a href="${link}">${link}</a></p>`,
  });
};

exports.sendResetOtpEmail = (user, otp) =>
  sendMail({
    to: user.email,
    subject: 'Your password reset code',
    text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your password reset code:</p><h2>${otp}</h2><p>It expires in 10 minutes.</p>`,
  });
