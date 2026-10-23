import { Schema } from "effect";
import { randomBytes } from "node:crypto";
import { get } from "./config.ts";

const FEEDBACK_REQUESTS = new Map<string, FeedbackRequest>();

const CreateFeedbackRequestRequestSchema = Schema.Struct({
  mpId: Schema.NumberFromString,
});
type CreateFeedbackRequestRequest = Schema.Schema.Type<
  typeof CreateFeedbackRequestRequestSchema
>;

const FeedbackRequestSchema = Schema.Struct({
  mpId: Schema.Number,
  requestId: Schema.String,
});
type FeedbackRequest = Schema.Schema.Type<typeof FeedbackRequestSchema>;

export async function getFeedbackRequestText(secretLink: URL): Promise<string> {
  // TODO
  return `Guten Tag, Wir möchten Sie bitten, zu folgenden Interessenbindungen Stellung zu nehmen: ${secretLink}.\nFreundliche Grüsse`;
}

export function createSecretLink(request: FeedbackRequest): URL {
  const secretLink = new URL(
    `/de/feedback/${request.requestId}`,
    get("base_url"),
  );
  return secretLink;
}

export async function createFeedbackRequest(
  body: unknown,
): Promise<FeedbackRequest> {
  const req = Schema.decodeUnknownSync(CreateFeedbackRequestRequestSchema)(
    body,
  );
  const randomString = randomBytes(32).toString("hex");
  const feedbackRequest = { requestId: randomString, mpId: req.mpId };
  await saveFeedbackRequest(feedbackRequest);
  return feedbackRequest;
}

async function saveFeedbackRequest(request: FeedbackRequest): Promise<void> {
  if (FEEDBACK_REQUESTS.has(request.requestId)) {
    throw new Error("request already saved");
  }
  FEEDBACK_REQUESTS.set(request.requestId, request);
}

export async function getFeedbackRequest(
  requestId: string,
): Promise<FeedbackRequest | undefined> {
  return FEEDBACK_REQUESTS.get(requestId);
}
