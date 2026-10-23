import { Schema } from "effect";
import { randomBytes } from "node:crypto";
import { get } from "./config.ts";
import type { DeepMutable } from "effect/Types";

const FEEDBACK_REQUESTS = new Map<string, FeedbackRequest>();

const feedbackFormFieldNameSchema = Schema.TemplateLiteralParser([
  Schema.Literals(["response", "comment"]),
  "_",
  Schema.NumberFromString,
]);

const savedFeedbackSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    response: Schema.optional(Schema.Literals(["ok", "wrong"])),
    comment: Schema.optional(Schema.String),
  }),
);
type SavedFeedback = Schema.Schema.Type<typeof savedFeedbackSchema>;

const createFeedbackRequestRequestSchema = Schema.Struct({
  mpId: Schema.NumberFromString,
});

const feedbackRequestSchema = Schema.Struct({
  mpId: Schema.Number,
  requestId: Schema.String,
  feedback: Schema.optional(savedFeedbackSchema),
});
type FeedbackRequest = Schema.Schema.Type<typeof feedbackRequestSchema>;

export async function getFeedbackRequestText(secretLink: URL): Promise<string> {
  // TODO
  return `Guten Tag, Wir möchten Sie bitten, zu folgenden Interessenbindungen Stellung zu nehmen: ${secretLink}.\nFreundliche Grüsse`;
}

export function createSecretLink(request: FeedbackRequest): URL {
  const secretLink = new URL(
    `/de/feedback/${request.requestId}/form`,
    get("base_url"),
  );
  return secretLink;
}

export async function createFeedbackRequest(
  body: unknown,
): Promise<FeedbackRequest> {
  const req = Schema.decodeUnknownSync(createFeedbackRequestRequestSchema)(
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

export function parseResponse(body: Record<string, string>): SavedFeedback {
  const responses: DeepMutable<SavedFeedback> = {};
  for (const key in body) {
    const [field, _, interestId] = Schema.decodeUnknownSync(
      feedbackFormFieldNameSchema,
    )(key);
    if (!responses[interestId]) {
      responses[interestId] = {};
    }
    if (body[key]) {
      responses[interestId][field] = body[key];
    }
  }
  return Schema.decodeSync(savedFeedbackSchema)(responses);
}

export async function saveFeedback(
  request: FeedbackRequest,
  feedback: SavedFeedback,
): Promise<void> {
  request.feedback = feedback;
  FEEDBACK_REQUESTS.set(request.requestId, request);
}
