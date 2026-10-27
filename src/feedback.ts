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

const partialFeedbackResponseSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    response: Schema.optional(Schema.Literals(["ok", "wrong"])),
    comment: Schema.optional(Schema.String),
  }),
);
type PartialFeedbackResponse = Schema.Schema.Type<
  typeof partialFeedbackResponseSchema
>;
const completeFeedbackResponseSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    response: Schema.Literals(["ok", "wrong"]),
    comment: Schema.optional(Schema.String),
  }),
);

type CompleteFeedbackResponse = Schema.Schema.Type<
  typeof completeFeedbackResponseSchema
>;
const createFeedbackRequestRequestSchema = Schema.Struct({
  personId: Schema.NumberFromString,
});

export const feedbackRequestSchema = Schema.Union([
  Schema.Struct({
    state: Schema.Literal("new"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.Date,
  }),
  Schema.Struct({
    state: Schema.Literal("partial"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.DateFromString,
    updatedAt: Schema.DateFromString,
    feedback: partialFeedbackResponseSchema,
  }),
  Schema.Struct({
    state: Schema.Literal("complete"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.DateFromString,
    updatedAt: Schema.DateFromString,
    feedback: completeFeedbackResponseSchema,
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
  const req = Schema.decodeUnknownSync(createFeedbackRequestRequestSchema)(
    body,
  );
  const randomString = randomBytes(32).toString("hex");
  const feedbackRequest = feedbackRequestSchema.make({
    state: "new",
    requestId: randomString,
    personId: req.personId,

    personType: "mp", // TODO
    createdAt: new Date(),
  });
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

export function parseResponse(
  body: Record<string, string>,
): PartialFeedbackResponse {
  const responses: DeepMutable<PartialFeedbackResponse> = {};
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
  return Schema.decodeSync(partialFeedbackResponseSchema)(responses);
}

export async function saveFeedback(
  request: FeedbackRequest,
  feedback: PartialFeedbackResponse,
): Promise<void> {
  request.state = "partial";
  request.feedback = feedback;
  request.updatedAt = new Date().toISOString();
  FEEDBACK_REQUESTS.set(request.requestId, request);
}
