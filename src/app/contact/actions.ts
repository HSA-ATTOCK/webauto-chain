"use server";

import nodemailer from "nodemailer";
import { z } from "zod";

import { env } from "@/lib/env";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().email("Enter a valid email address").optional(),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20, "Phone number is too long"),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more about how we can help")
    .max(1500, "Keep your message under 1500 characters"),
});

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

const transporter = env.EMAIL_SERVER
  ? nodemailer.createTransport(env.EMAIL_SERVER)
  : null;

const supportRecipient =
  process.env.SUPPORT_EMAIL ?? env.EMAIL_FROM ?? "support@webauto-chain.com";

export async function submitContact(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const rawName = formData.get("name");
  const rawEmail = formData.get("email");
  const rawPhone = formData.get("phone");
  const rawMessage = formData.get("message");

  const emailValue =
    typeof rawEmail === "string" && rawEmail.trim().length > 0
      ? rawEmail.trim()
      : undefined;

  const parsed = contactSchema.safeParse({
    name: typeof rawName === "string" ? rawName : "",
    email: emailValue,
    phone: typeof rawPhone === "string" ? rawPhone : "",
    message: typeof rawMessage === "string" ? rawMessage : "",
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid form input";
    return { status: "error", message: firstError };
  }

  if (!transporter || !supportRecipient) {
    return {
      status: "error",
      message: "Contact form is temporarily unavailable. Try again later.",
    };
  }

  try {
    const { name, email, phone, message } = parsed.data;
    const replyConfig = email ? { replyTo: email } : {};

    await transporter.sendMail({
      to: supportRecipient,
      from: env.EMAIL_FROM ?? supportRecipient,
      subject: `New contact message from ${name}`,
      text: `Name: ${name}\nEmail: ${
        email ?? "Not provided"
      }\nPhone: ${phone}\n\n${message}`,
      html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${
        email ?? "Not provided"
      }</p><p><strong>Phone:</strong> ${phone}</p><p>${message.replace(
        /\n/g,
        "<br/>"
      )}</p>`,
      ...replyConfig,
    });

    return {
      status: "success",
      message:
        "Thanks for reaching out. We will reply within one business day.",
    };
  } catch (error) {
    console.error("Contact form submission failed", error);
    return {
      status: "error",
      message: "We could not send your message. Please try again shortly.",
    };
  }
}
