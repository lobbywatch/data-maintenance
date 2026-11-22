import { Schema } from "effect";
import { randomBytes } from "node:crypto";
import { get } from "./config.ts";
import type { DeepMutable } from "effect/Types";
import { PersonSchema } from "./data.ts";

type Versioned<T> = {
  version: string;
  data: T;
};

interface FeedbackPersister {
  get(id: string): Promise<Versioned<FeedbackRequest> | undefined>;
  getAll(): Promise<Array<Versioned<FeedbackRequest>>>;
  save(request: FeedbackRequest): Promise<Versioned<FeedbackRequest>>;
}

class InMemoryPersister implements FeedbackPersister {
  FEEDBACK_REQUESTS = new Map<string, FeedbackRequest>();
  async save(request: FeedbackRequest): Promise<Versioned<FeedbackRequest>> {
    if (
      request.state === "new" &&
      this.FEEDBACK_REQUESTS.has(request.requestId)
    ) {
      throw new Error("request already saved");
    }
    request.updatedAt = new Date().toISOString();
    this.FEEDBACK_REQUESTS.set(
      request.requestId,
      Schema.decodeUnknownSync(feedbackRequestSchema)(request),
    );
    return { version: "TODO", data: request };
  }

  async get(id: string): Promise<Versioned<FeedbackRequest> | undefined> {
    const request = this.FEEDBACK_REQUESTS.get(id);
    if (!request) {
      return;
    }
    return { version: "TODO", data: request };
  }

  async getAll() {
    return this.FEEDBACK_REQUESTS.values()
      .map((r) => ({ version: "TODO", data: r }))
      .toArray();
  }
}

const persister: FeedbackPersister = new InMemoryPersister();

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
    createdAt: Schema.String, // TODO find something like zod's z.iso.datetime()
  }),
  Schema.Struct({
    state: Schema.Literal("sent"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.String, // TODO find something like zod's z.iso.datetime()
    sentAt: Schema.String, // TODO find something like zod's z.iso.datetime()
  }),
  Schema.Struct({
    state: Schema.Literal("partial"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.String, // TODO find something like zod's z.iso.datetime()
    updatedAt: Schema.String, // TODO find something like zod's z.iso.datetime()
    feedback: partialFeedbackSchema,
  }),
  Schema.Struct({
    state: Schema.Literal("complete"),
    personId: Schema.Finite,
    personType: PersonSchema.fields.type,
    requestId: Schema.String,
    createdAt: Schema.String, // TODO find something like zod's z.iso.datetime()
    updatedAt: Schema.String, // TODO find something like zod's z.iso.datetime()
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
  await persister.save(feedbackRequest);
  return feedbackRequest;
}

export async function getFeedbackRequest(
  requestId: string,
): Promise<FeedbackRequest | undefined> {
  return persister.get(requestId);
}

export async function getFeedbackRequests(): Promise<
  Array<Versioned<FeedbackRequest>>
> {
  return persister.getAll();
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

export async function saveFeedback(request: FeedbackRequest): Promise<Versioned<FeedbackRequest>> {
  return persister.save(request)
}
