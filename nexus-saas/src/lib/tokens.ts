import crypto from "crypto";
import { db } from "@/lib/db";

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function randomNumericCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export const generatePasswordResetToken = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const token = randomToken();
  const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

  await db.passwordResetToken.deleteMany({
    where: { email: normalizedEmail },
  });

  const passwordResetToken = await db.passwordResetToken.create({
    data: {
      email: normalizedEmail,
      token,
      expires
    }
  });

  return passwordResetToken;
};

export const generateEmailVerificationToken = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const token = randomToken();
  const expires = new Date(Date.now() + 24 * 3600 * 1000);

  await db.verificationToken.deleteMany({
    where: { identifier: normalizedEmail, type: "EMAIL" },
  });

  return db.verificationToken.create({
    data: {
      identifier: normalizedEmail,
      token,
      type: "EMAIL",
      expires,
    },
  });
};

export const generatePhoneVerificationToken = async (phoneNumber: string) => {
  const normalizedPhone = phoneNumber.replace(/\D/g, "");
  const token = randomNumericCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await db.verificationToken.deleteMany({
    where: { identifier: normalizedPhone, type: "PHONE" },
  });

  return db.verificationToken.create({
    data: {
      identifier: normalizedPhone,
      token,
      type: "PHONE",
      expires,
    },
  });
};
