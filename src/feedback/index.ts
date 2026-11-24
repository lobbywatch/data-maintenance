import { randomBytes } from "node:crypto";
import { get } from "../config.ts";
import {
  completeFeedbackSchema,
  createFeedbackRequestSchema,
  feedbackFormFieldNameSchema,
  feedbackFormPayloadSchema,
  type CompleteFeedback,
  type FeedbackRequest,
  type Versioned,
} from "./schema.ts";
import { InMemoryPersister, type FeedbackPersister } from "./persistence.ts";

const persister: FeedbackPersister = new InMemoryPersister();

export async function getFeedbackRequestText(secretLink: URL): Promise<string> {
  // TODO
  return `Guten Tag,\n\nWir möchten Sie bitten, zu folgenden Interessenbindungen Stellung zu nehmen: ${secretLink}.\n\nFreundliche Grüsse`;
}

export function createSecretLink(request: FeedbackRequest): URL {
  return new URL(`/de/feedback/${request.requestId}/form`, get("base_url"));
}

export function createViewLink(request: FeedbackRequest): URL {
  return new URL(`/de/feedback/${request.requestId}/view`, get("base_url"));
}

export async function createFeedbackRequest(
  body: unknown,
): Promise<FeedbackRequest> {
  const req = createFeedbackRequestSchema.parse(body);
  const randomString = randomBytes(32).toString("hex");
  const feedbackRequest: FeedbackRequest = {
    state: "new",
    requestId: randomString,
    personId: req.personId,
    personType: "mp", // TODO
    createdAt: new Date().toISOString(),
  };
  await persister.save(feedbackRequest, "TODO");
  return feedbackRequest;
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

export function parsePartialFeedback(
  body: Record<string, string>,
): CompleteFeedback {
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

export function parseCompleteFeedback(
  body: Record<string, string>,
): CompleteFeedback {
  const feedback = parsePartialFeedback(body);
  return completeFeedbackSchema.parse(feedback);
}

export async function saveFeedback(
  request: FeedbackRequest,
  version: string,
): Promise<Versioned<FeedbackRequest>> {
  return persister.save(request, version);
}
