import { identity, Schema } from "effect";
import { randomBytes } from "node:crypto";
import { get } from "./config.ts";
import type { DeepMutable } from "effect/Types";
import { PersonSchema } from "./data.ts";

const FEEDBACK_REQUESTS = new Map<string, FeedbackRequest>();

const feedbackFormFieldNameSchema = Schema.TemplateLiteralParser([
  Schema.Literals(["response", "comment"]),
  "_",
  Schema.NumberFromString,
]);

const partialFeedbackSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    response: Schema.optional(Schema.Literals(["ok", "wrong"])),
    comment: Schema.optional(Schema.String),
  }),
);
type PartialFeedback = Schema.Schema.Type<typeof partialFeedbackSchema>;
const completeFeedbackSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    response: Schema.Literals(["ok", "wrong"]),
    comment: Schema.optional(Schema.String),
  }),
);

type CompleteFeedback = Schema.Schema.Type<typeof completeFeedbackSchema>;
const createFeedbackRequestSchema = Schema.Struct({
  personId: Schema.NumberFromString,
});

export const feedbackRequestSchema = Schema.Union([
  Schema.Struct({
    state: Schema.Literal("new"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.DateFromString,
  }),
  Schema.Struct({
    state: Schema.Literal("partial"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.DateFromString,
    updatedAt: Schema.DateFromString,
    feedback: partialFeedbackSchema,
  }),
  Schema.Struct({
    state: Schema.Literal("complete"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.DateFromString,
    updatedAt: Schema.DateFromString,
    feedback: completeFeedbackSchema,
  }),
]);
type FeedbackRequest = Schema.Schema.Type<typeof feedbackRequestSchema>;

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
  const req = Schema.decodeUnknownSync(createFeedbackRequestSchema)(body);
  const randomString = randomBytes(32).toString("hex");
  const feedbackRequest = {
    state: "new",
    requestId: randomString,
    personId: req.personId,
    personType: "mp", // TODO
    createdAt: new Date().toISOString(),
  };
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

export async function getFeedbackRequests(): Promise<Array<FeedbackRequest>> {
  return FEEDBACK_REQUESTS.values().toArray();
}

export function parsePartialFeedback(
  body: Record<string, string>,
): PartialFeedback {
  const responses: DeepMutable<PartialFeedback> = {};
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
  return Schema.decodeSync(partialFeedbackSchema)(responses);
}

export function parseCompleteFeedback(
  body: Record<string, string>,
): CompleteFeedback {
  const feedback = parsePartialFeedback(body);
  return Schema.decodeUnknownSync(completeFeedbackSchema)(feedback);
}

export async function saveFeedback(request: FeedbackRequest): Promise<void> {
  request.updatedAt = new Date().toISOString();
  FEEDBACK_REQUESTS.set(
    request.requestId,
    Schema.decodeUnknownSync(feedbackRequestSchema)(request),
  );
}
