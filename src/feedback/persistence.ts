import { feedbackRequestSchema, type FeedbackRequest } from "./schema.ts";

export type Version = null | string;

export type Versioned<T> = {
  version: Version;
  data: T;
};

export interface FeedbackPersister {
  get(id: string): Promise<Versioned<FeedbackRequest> | undefined>;
  getAll(): Promise<Array<Versioned<FeedbackRequest>>>;
  save(
    request: FeedbackRequest,
    version: Version,
  ): Promise<Versioned<FeedbackRequest>>;
}

export class InMemoryPersister implements FeedbackPersister {
  FEEDBACK_REQUESTS = new Map<string, Versioned<FeedbackRequest>>();

  async save(request: FeedbackRequest): Promise<Versioned<FeedbackRequest>> {
    if (
      request.state === "new" &&
      this.FEEDBACK_REQUESTS.has(request.requestId)
    ) {
      throw new Error("request already saved");
    } else if (request.state === "new") {
      this.FEEDBACK_REQUESTS.set(request.requestId, {
        version: "TODO",
        data: feedbackRequestSchema.parse(request),
      });
    } else {
      const updatedRequest: FeedbackRequest = {
        ...request,
        updatedAt: new Date().toISOString(),
      };
      this.FEEDBACK_REQUESTS.set(request.requestId, {
        version: "TODO",
        data: feedbackRequestSchema.parse(updatedRequest),
      });
    }
    return { version: "TODO", data: request };
  }

  async get(id: string): Promise<Versioned<FeedbackRequest> | undefined> {
    return this.FEEDBACK_REQUESTS.get(id);
  }

  async getAll() {
    return this.FEEDBACK_REQUESTS.values().toArray();
  }
}
