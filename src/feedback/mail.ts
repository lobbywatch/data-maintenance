import {
  createTransport,
  type Mail,
  type SMTPSentMessageInfo,
  type SMTPTransportOptions,
} from "nodemailer";

import { get } from "../config.ts";
import { createLogger } from "../log.ts";

const log = createLogger("mailer");

interface Mailer {
  open(): void;
  close(): void;
  send(mail: {
    to: string;
    from: string;
    subject: string;
    text: string;
    replyTo?: string | undefined;
  }): Promise<
    { ok: true; messageId: string } | { ok: false; response: string }
  >;
}

class ConsoleMailer implements Mailer {
  #log;

  constructor() {
    this.#log = createLogger(ConsoleMailer.name);
  }

  open(): void {
    // NOP
  }
  close(): void {
    // NOP
  }
  async send(mail: {
    to: string;
    from: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<
    { ok: true; messageId: string } | { ok: false; response: string }
  > {
    this.#log.info("sent mail", { mail });
    return { ok: true, messageId: "" };
  }
}

class SMTPMailer implements Mailer {
  #mailer: Mail<SMTPSentMessageInfo, SMTPTransportOptions> | undefined;
  #log;

  constructor() {
    this.#log = createLogger(SMTPMailer.name);
  }

  open(): void {
    this.#mailer = createTransport({
      service: "infomaniak",
      auth: { user: get("smtp_user"), pass: get("smtp_pass") },
    });
    this.#log.debug("transport created");
  }

  close() {
    this.#mailer?.close();
    this.#mailer = undefined;
    this.#log.debug("transport closed");
  }

  async send(mail: {
    to: string;
    from: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<
    { ok: true; messageId: string } | { ok: false; response: string }
  > {
    if (!this.#mailer) {
      throw new Error("mailer not ready");
    }

    const response = await this.#mailer.sendMail({
      subject: mail.subject,
      text: mail.text,
      to: mail.to,
      from: mail.from,
      replyTo: mail.replyTo,
    });
    this.#log.debug("mail transport response", { response });

    if (response.accepted.includes(mail.to)) {
      return { ok: true, messageId: response.messageId };
    }
    return { ok: false, response: response.response };
  }
}

export async function withMailer(
  fn: (sendMail: Mailer["send"]) => Promise<void>,
): Promise<void> {
  const mailer = getMailer();
  mailer.open();
  log.debug("transport created");
  await fn(mailer.send.bind(mailer));
  mailer.close();
  log.debug("transport closed");
}

function getMailer(): Mailer {
  // TODO
  return new ConsoleMailer();
}
