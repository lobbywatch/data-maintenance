import { randomBytes } from "node:crypto";
import { get } from "../config.ts";
import {
  completeFeedbackSchema,
  createFeedbackRequestSchema,
  feedbackFormFieldNameSchema,
  feedbackFormPayloadSchema,
  type CompleteFeedback,
  type FeedbackRequest,
} from "./schema.ts";
import {
  InMemoryPersister,
  type FeedbackPersister,
  type Version,
  type Versioned,
} from "./persistence.ts";
import { Readable } from "node:stream";
import { getPerson } from "../lwdata/index.ts";
import { withMailer } from "./mail.ts";
import type { Person } from "../lwdata/schema.ts";

const persister: FeedbackPersister = new InMemoryPersister();

const TEMPLATES: Record<
  Person["contactLanguage"],
  { subject: string; body: string }
> = {
  de: {
    subject: "Bitte ausfüllen",
    body: "Guten Tag,\n\nWir möchten Sie bitten, zu folgenden Interessenbindungen Stellung zu nehmen:\n\n#LINK#\n\nFreundliche Grüsse",
  },
  fr: { subject: "Bonjour", body: "Bonjour\n\n#LINK#" },
};

export function createSecretLink(request: FeedbackRequest): URL {
  return new URL(`/de/feedback/${request.requestId}/form`, get("base_url"));
}

export function createViewLink(request: FeedbackRequest): URL {
  return new URL(`/de/feedback/${request.requestId}/view`, get("base_url"));
}

export async function createFeedbackRequests(
  body: unknown,
): Promise<Array<Versioned<FeedbackRequest>>> {
  const parsedFormBody = createFeedbackRequestSchema.parse(body);
  const requests = parsedFormBody.persons.map((person) => {
    const feedbackRequest: FeedbackRequest = {
      state: "new",
      requestId: randomBytes(32).toString("hex"),
      personId: person.id,
      personType: person.type,
      createdAt: new Date().toISOString(),
    };
    return { data: feedbackRequest, version: null };
  });
  // TODO yes no maybe??
  Readable.from(requests)
    .map((feedbackRequest) => persister.save(feedbackRequest, "TODO"), {
      concurrency: 1,
    })
    .toArray();
  return requests;
}

export async function sendFeedbackRequests(
  mail: { recipient: string; sender: string; replyTo?: string },
  feedbackRequests: Array<Versioned<FeedbackRequest>>,
): Promise<void> {
  await withMailer(async (sendMail) => {
    for (const feedbackRequest of feedbackRequests) {
      const secretLink = createSecretLink(feedbackRequest.data);
      const person = await getPerson(feedbackRequest.data.personId, "mp");
      const template = TEMPLATES[person.contactLanguage];
      const text = template.body.replace("#LINK#", secretLink.href);
      const result = await sendMail({
        to: mail.recipient,
        from: mail.sender,
        subject: template.subject,
        text,
        replyTo: mail.replyTo,
      });

      if (result.ok) {
        const ts = new Date().toISOString();
        const updatedFeedbackRequest: FeedbackRequest = {
          ...feedbackRequest.data,
          state: "sent",
          sentAt: ts,
          updatedAt: ts,
        };
        await persister.save(updatedFeedbackRequest, feedbackRequest.version);
      } else {
        const ts = new Date().toISOString();
        const updatedFeedbackRequest: FeedbackRequest = {
          ...feedbackRequest.data,
          state: "failed",
          updatedAt: ts,
          failedAt: ts,
          message: result.response,
        };
        await persister.save(updatedFeedbackRequest, feedbackRequest.version);
      }
    }
  });
}

export async function savePartialFeedback(
  feedbackRequest: Versioned<FeedbackRequest>,
  body: unknown,
): Promise<void> {
  if (
    feedbackRequest.data.state === "new" ||
    feedbackRequest.data.state === "failed"
  ) {
    throw new Error("request cannot be new or failed");
  }
  const feedback = parseFeedback(body);
  const updatedRequest: FeedbackRequest = {
    ...feedbackRequest.data,
    state: "partial",
    updatedAt: new Date().toISOString(),
    feedback,
  };
  await saveFeedback(updatedRequest, feedbackRequest.version);
}

export async function saveCompleteFeedback(
  feedbackRequest: Versioned<FeedbackRequest>,
  body: unknown,
): Promise<void> {
  if (
    feedbackRequest.data.state === "new" ||
    feedbackRequest.data.state === "failed"
  ) {
    throw new Error("request cannot be new or failed");
  }
  const feedback = parseFeedback(body);
  const updatedRequest: FeedbackRequest = {
    ...feedbackRequest.data,
    state: "complete",
    updatedAt: new Date().toISOString(),
    feedback,
  };
  await saveFeedback(updatedRequest, feedbackRequest.version);
}

export async function getFeedbackRequest(
  requestId: string,
): Promise<Versioned<FeedbackRequest> | undefined> {
  return persister.get(requestId);
}

export async function getFeedbackRequests(): Promise<
  Array<Versioned<FeedbackRequest>>
> {
  return persister.getAll();
}

export function parseFeedback(body: unknown): CompleteFeedback {
  const parsedBody = feedbackFormPayloadSchema.parse(body);
  const responses = Object.keys(parsedBody)
    .filter((key) => key.startsWith("response_"))
    .map((key) => {
      const tokens = key.split("_");
      const parsedKey = feedbackFormFieldNameSchema.parse(key);
      if (tokens.length === 2) {
        const interestId = tokens[1];
        if (parsedBody[parsedKey] === "ok") {
          return [interestId, { response: "ok" }];
        } else if (parsedBody[parsedKey] === "wrong") {
          const commentKey = feedbackFormFieldNameSchema.parse(
            `comment_${tokens[1]}`,
          );
          return [
            interestId,
            {
              response: "wrong",
              comment: parsedBody[commentKey],
            },
          ];
        }
      }
      throw new Error("wrong key format");
    });

  return completeFeedbackSchema.parse(Object.fromEntries(responses));
}

export async function saveFeedback(
  request: FeedbackRequest,
  version: Version,
): Promise<Versioned<FeedbackRequest>> {
  return persister.save(request, version);
}
