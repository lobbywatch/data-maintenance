import express, { type Express } from "express";
import helmet from "helmet";
import i18next from "i18next";
import MF2 from "i18next-mf2";
import * as i18nextmiddleware from "i18next-http-middleware";
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

const app: Express = express();

const port = 3000;

app.use(bodyParser.urlencoded());

const engine = new Liquid();
engine.registerFilter("t", function (key: string, options) {
  return i18next.t(key, options);
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

// TODO make it work and put it into separate module
i18next
  .use(MF2)
  .use(i18nextmiddleware.LanguageDetector)
  .init({
    fallbackLng: "de",
    preload: ["de", "fr"],
    debug: true,
    detection: { order: ["path"] },
    resources: {
      de: {
        translation: {
          table_newFeedbackButton: "Rückmeldung anfragen",
          tableHeader_lastName: "Nachname",
          tableHeader_firstName: "Vorname",
          navTitle_feedback: "Rückmeldungen",
          navTitle_logout: "Ausloggen",
          feedbackForm_header_text: "Ihre Interessenbindungen",
          feedbackForm_tableHeader_kind: "Art",
          feedbackForm_tableHeader_function: "Funktion",
          feedbackForm_tableHeader_organisationName: "Organisation",
          feedbackForm_tableHeader_organisationLegalForm: "Rechtsform",
          feedbackForm_response_legend: "Ihre Rückmeldung",
          feedbackForm_responseLabel_ok: "Stimmt",
          feedbackForm_responseLabel_wrong: "Falsch",
          feedbackForm_responseLabel_comment: "Kommentar",
          feedbackForm_completeButton_label: "Abschliessen",
          feedbackForm_saveButton_label: "Speichern",
          feedbackRequests_headline: "Offene Rückmeldungsanfragen",
          requests_tableHeader_state: "Status",
          feedbackView_header_text:
            "Rückmeldungen von {$firstName} {$lastName}",
          feedbackView_tableHeader_kind: "Art",
          feedbackView_tableHeader_function: "Funktion",
          feedbackView_tableHeader_organisationName: "Organisation",
          feedbackView_tableHeader_organisationLegalForm: "Rechtsform",
          feedbackView_tableHeader_compensation: "Vergütung",
          feedbackView_tableHeader_compensationDescription: "Beschreibung",
          feedbackView_tableHeader_form: "Rückmeldung",
          feedbackView_tableHeader_response: "Antwort",
          feedbackView_tableHeader_comment: "Kommentar",
          feedbackRequests_viewLink_text: "Anschauen",
          feedbackRequests_createRequestLink_text: "Rückmeldung anfragen",
          feedbackRequests_noRequests_text: "Keine Anfragen vorhanden",
          feedback_already_completed_text:
            "Diese Rückmeldungen können nicht mehr bearbeitet werden.",
          feedback_complete_header: "Danke",
          feedback_complete_text:
            "Wir haben Ihre Rückmeldungen erhalten. Sie können diesen Tab nun schliessen.",
        },
      },
      fr: {
        translation: {
          table_newFeedbackButton: "demander commentaires",
          tableHeader_lastName: "nom",
          tableHeader_firstName: "prènom",
          navTitle_feedback: "commentaires",
          navTitle_logout: "se déconnecter",
        },
      },
    },
  });

app.use(
  i18nextmiddleware.handle(i18next, {
    ignoreRoutes: ["/.well-known", "/favicon.ico", "/style.css", "/callback"],
    removeLngFromUrl: false,
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
    user: req.oidc.user,
    lang: req.language,
  });
});

app.get("/:lng/feedback/request", async function (req, res) {
  const mps = await getPersons();
  res.render("feedback", {
    mps,
    lang: req.language,
    action: `/${req.language}/feedback/createRequest`,
  });
});

app.post("/:lng/feedback/createRequest", async function (req, res) {
  try {
    const feedbackRequest = await createFeedbackRequest(req.body);
    const secretLink = createSecretLink(feedbackRequest);
    const text = await getFeedbackRequestText(secretLink);
    res.render("feedback-request-created", { text, secretLink });
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
    res.render("feedback-already-complete");
    return;
  }

  const interests = await getInterests(feedbackRequest.personId);

  res.render("feedback-form", {
    request: feedbackRequest,
    interests,
    saveAction: `/${req.language}/feedback/${requestId}/save`,
    completeAction: `/${req.language}/feedback/${requestId}/complete`,
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

app.post("/:lng/feedback/:requestId/complete", async function (req, res) {
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
    res.render("feedback-completed");
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get("/:lng/feedback", async function (req, res) {
  const feedbackRequests = await getFeedbackRequests();

  res.render("feedback-requests", {
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
