import express, { type Express } from "express";
import helmet from "helmet";
import { Liquid } from "liquidjs";
import bodyParser from "body-parser";
import { getPersons, getInterests, getPerson } from "./data.ts";
import { auth } from "express-openid-connect";
import { get } from "./config.ts";
import { randomBytes } from "node:crypto";
import {
  createFeedbackRequest,
  createSecretLink,
  createViewLink,
  getFeedbackRequest,
  getFeedbackRequests,
  getFeedbackRequestText,
  parseCompleteFeedback,
  parsePartialFeedback,
  saveFeedback,
} from "./feedback.ts";
import * as i18n from "./i18n.ts";

const app: Express = express();

const port = 3000;

app.use(bodyParser.urlencoded());

const engine = new Liquid({
  cache: process.env.NODE_ENV === "production",
});

engine.registerFilter("t", function (key: string, options) {
  const t = this.context.environments.t ?? this.context.environments.lang.t;
  return t(key, options);
});

engine.registerFilter("if_true", (condition, truthyValue) => {
  return condition ? truthyValue : "";
});

engine.registerFilter("currency", (value) => {
  return new Intl.NumberFormat("ch-DE", {
    style: "currency",
    currency: "CHF",
  }).format(value);
});

app.param(
  "lng",
  i18n.param({
    ignoreRoutes: ["/.well-known", "/favicon.ico", "/style.css", "/callback"],
  }),
);

app.set("trust proxy", 1);

app.engine("liquid", engine.express());
app.set("views", "src/templates");
app.set("view engine", "liquid");

app.use(helmet());
app.use("/", express.static("static"));
app.use("/ui", express.static("src/ui"));
app.use(
  auth({
    issuerBaseURL: get("oidc_server"),
    baseURL: get("base_url"),
    clientID: get("oidc_client_id"),
    secret: randomBytes(64).toString("hex"),
    idpLogout: false,
  }),
);

app.get("/", function (req, res) {
  res.redirect("/de");
});

app.get("/:lng", async function (req, res) {
  res.render("index", {
    t: res.t,
    user: req.oidc.user,
  });
});

app.get("/:lng/feedback/request", async function (req, res) {
  const mps = await getPersons();
  res.render("feedback", {
    mps,
    t: res.t,
    action: `/${req.language}/feedback/createRequest`,
  });
});

app.post("/:lng/feedback/createRequest", async function (req, res) {
  try {
    const feedbackRequest = await createFeedbackRequest(req.body);
    const secretLink = createSecretLink(feedbackRequest);
    const text = await getFeedbackRequestText(secretLink);
    res.render("feedback-request-created", { t: res.t, text, secretLink });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get("/:lng/feedback/:requestId/form", async function (req, res) {
  const requestId = req.params.requestId;
  const feedbackRequest = await getFeedbackRequest(requestId);
  if (!feedbackRequest) {
    res.sendStatus(404);
    return;
  }

  if (feedbackRequest.state === "complete") {
    res.render("feedback-already-complete", { t: res.t });
    return;
  }

  const interests = await getInterests(feedbackRequest.personId);

  res.render("feedback-form", {
    t: res.t,
    request: feedbackRequest,
    interests,
    saveAction: `/${req.language}/feedback/${requestId}/save`,
    submitAction: `/${req.language}/feedback/${requestId}/submit`,
  });
});

app.get("/:lng/feedback/:requestId/view", async function (req, res) {
  const requestId = req.params.requestId;
  const feedbackRequest = await getFeedbackRequest(requestId);
  if (!feedbackRequest) {
    res.sendStatus(404);
    return;
  }
  const person = await getPerson(
    feedbackRequest.personId,
    feedbackRequest.personType,
  );
  const interests = await getInterests(feedbackRequest.personId);
  res.render("feedback-view", {
    t: res.t,
    request: feedbackRequest,
    interests,
    person,
  });
});

app.post("/:lng/feedback/:requestId/save", async function (req, res) {
  try {
    const feedbackRequest = await getFeedbackRequest(req.params.requestId);
    if (!feedbackRequest) {
      res.sendStatus(404);
      return;
    }
    const feedback = parsePartialFeedback(req.body);
    feedbackRequest.state = "partial";
    feedbackRequest.feedback = feedback;
    await saveFeedback(feedbackRequest);
    res.redirect(`/${req.language}/feedback/${req.params.requestId}/form`);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.post("/:lng/feedback/:requestId/submit", async function (req, res) {
  try {
    const feedbackRequest = await getFeedbackRequest(req.params.requestId);
    if (!feedbackRequest) {
      res.sendStatus(404);
      return;
    }
    const feedback = parseCompleteFeedback(req.body);
    feedbackRequest.state = "complete";
    feedbackRequest.feedback = feedback;
    await saveFeedback(feedbackRequest);
    res.render("");
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get("/:lng/feedback", async function (req, res) {
  const feedbackRequests = await getFeedbackRequests();

  res.render("feedback-requests", {
    t: res.t,
    lang: new i18n.LanguageDrop(req.language, res.t),
    createRequestLink: `/${req.language}/feedback/request`,
    feedbackRequests: feedbackRequests.map((request) => {
      const person = getPerson(request.personId, request.personType);
      request.person = person;
      request.viewLink = createViewLink(request);
      return request;
    }),
  });
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
