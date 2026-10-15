import express, { type Express } from "express";
import helmet from "helmet";
import i18next from "i18next";
import * as i18nextmiddleware from "i18next-http-middleware";
import { Liquid } from "liquidjs";

import { getMps } from "./db.ts";
import { auth } from "express-openid-connect";
import { get } from "./config.ts";
import { randomBytes } from "node:crypto";

const app: Express = express();

const port = 3000;

const engine = new Liquid();
engine.registerFilter("t", function (key: string) {
  return i18next.t(key);
});

await i18next.use(i18nextmiddleware.LanguageDetector).init({
  fallbackLng: "de",
  preload: ["de", "fr"],
  debug: true,
  detection: { order: ["path", "header"], lookupPath: "lng" },
  resources: {
    de: {
      translation: {
        test: "hallo",
        tableHeader_lastName: "Nachname",
        tableHeader_firstName: "Vorname",
        navTitle_feedback: "Rückmeldungen",
        navTitle_logout: "Ausloggen",
      },
    },
    fr: {
      translation: {
        test: "bonjour",
        tableHeader_lastName: "nom",
        tableHeader_firstName: "prènom",
      },
    },
  },
});

app.set("trust proxy", 1);

app.engine("liquid", engine.express());
app.set("views", "src/templates"); // specify the views directory
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

app.use(
  i18nextmiddleware.handle(i18next, {
    ignoreRoutes: ["/.well-known"],
    removeLngFromUrl: false,
  }),
);

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
  });
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
