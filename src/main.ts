import express, { type Express } from "express";
import helmet from "helmet";
import i18next from "i18next";
import * as i18nextmiddleware from "i18next-http-middleware";
import { Liquid } from "liquidjs";
import bodyParser from "body-parser";
import { getMps, getInterests } from "./data.ts";
import { auth } from "express-openid-connect";
import { get } from "./config.ts";
import { randomBytes } from "node:crypto";
import {
  createFeedbackRequest,
  createSecretLink,
  getFeedbackRequest,
  getFeedbackRequestText,
  parseResponse,
  saveFeedback,
} from "./feedbackRequest.ts";

const app: Express = express();

const port = 3000;

app.use(bodyParser.urlencoded());

const engine = new Liquid();
engine.registerFilter("t", function (key: string) {
  return i18next.t(key);
});

engine.registerFilter("if_true", (condition, truthyValue) => {
  console.log(condition);
  return condition ? truthyValue : "";
});

i18next.use(i18nextmiddleware.LanguageDetector).init({
  fallbackLng: "de", // TODO
  preload: ["de", "fr"],
  debug: true,
  detection: { order: ["path"] },
  resources: {
    de: {
      translation: {
        table_newFeedbackButton: "Rückmeldung einholen",
        tableHeader_lastName: "Nachname",
        tableHeader_firstName: "Vorname",
        navTitle_feedback: "Rückmeldungen",
        navTitle_logout: "Ausloggen",
        feedbackForm_header_text: "Ihre Interessenbindungen",
        feedbackForm_tableHeader_kind: "Art",
        feedbackForm_tableHeader_function: "Funktion",
        feedbackForm_tableHeader_organisationName: "Organisation",
        feedbackForm_response_legend: "Ihre Rückmeldung",
        feedbackForm_responseLabel_ok: "Stimmt",
        feedbackForm_responseLabel_wrong: "Falsch",
        feedbackForm_responseLabel_comment: "Kommentar",
        feedbackForm_submitButton_label: "Abschliessen",
        feedbackForm_saveButton_label: "Speichern",
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
    ignoreRoutes: ["/.well-known", "/favicon.ico"],
    removeLngFromUrl: false,
  }),
);

app.set("trust proxy", 1);

app.engine("liquid", engine.express());
app.set("views", "src/templates");
app.set("view engine", "liquid");

app.use(helmet());
app.use("/", express.static("static"));
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

app.get("/:lng/feedback", async function (req, res) {
  const mps = await getMps();
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
    res.render("feedback-request-template", { text, secretLink });
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

  const interessenBindungen = await getInterests(feedbackRequest.mpId);
  res.render("feedback-form", {
    feedback: feedbackRequest.feedback,
    interessenBindungen,
    saveAction: `/${req.language}/feedback/${requestId}/save`,
    submitAction: `/${req.language}/feedback/${requestId}/submit`,
  });
});

app.post("/:lng/feedback/:requestId/save", async function (req, res) {
  try {
    const feedbackRequest = await getFeedbackRequest(req.params.requestId);
    if (!feedbackRequest) {
      res.sendStatus(404);
      return;
    }
    const savedFeedback = parseResponse(req.body);
    await saveFeedback(feedbackRequest, savedFeedback);
    res.redirect(`/${req.language}/feedback/${req.params.requestId}/form`);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
