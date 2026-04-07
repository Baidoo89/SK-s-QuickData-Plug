import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";

export const generatePasswordResetToken = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const token = uuidv4();
  const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

  const existingToken = await db.passwordResetToken.findFirst({
    where: { email: normalizedEmail }
  });

  if (existingToken) {
    await db.passwordResetToken.delete({
      where: { id: existingToken.id }
    });
  }

  const passwordResetToken = await db.passwordResetToken.create({
    data: {
      email: normalizedEmail,
      token,
      expires
    }
  });

  return passwordResetToken;
};
