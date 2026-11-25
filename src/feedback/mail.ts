import { createTransport } from "nodemailer";

import { get } from "../config.ts";
import type { Person } from "../lwdata/schema.ts";
import { createLogger } from "../log.ts";

const log = createLogger("mail");
const TEMPLATES: Record<
  Person["contactLanguage"],
  { subject: string; body: string }
> = {
  de: {
    subject: "Bitte ausfüllen",
    body: "Guten Tag,\n\nWir möchten Sie bitten, zu folgenden Interessenbindungen Stellung zu nehmen: #LINK#.\n\nFreundliche Grüsse",
  },
  fr: { subject: "Bonjour", body: "Bonjour\n\n#LINK#" },
};

export async function sendFeedbackRequest(
  recipient: string,
  templateLanguage: Person["contactLanguage"],
  secretLink: URL,
): Promise<void> {
  const transporter = createTransport({
    service: "infomaniak",
    maxConnections: 3,
    auth: { user: get("smtp_user"), pass: get("smtp_pass") },
  });
  const template = TEMPLATES[templateLanguage];
  const text = template.body.replace("#LINK#", secretLink.href);
  const response = await transporter.sendMail({
    replyTo: "autorisierung@lobbywatch.ch",
    subject: template.subject,
    text,
    to: recipient,
    from: "no-reply@lobbywatch.ch",
  });
  transporter.close();

  if (response.rejected.includes(recipient)) {
    log.error("mail rejected", { response: response.response });
  } else if (response.accepted.includes(recipient)) {
    log.info("mail accepted", {
      response: response.response,
      messageId: response.messageId,
    });
  } else {
    log.warn("mail delivery unknown", { response });
  }
}
