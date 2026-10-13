import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import i18next from "i18next";
import * as i18nextmiddleware from "i18next-http-middleware";
import { Liquid } from "liquidjs";

import {
  handleAuthentication,
  discoverOidcConfiguration,
  startLoginFlow,
  continueLoginFlow,
  deleteReturnToCookie,
  isAnonymous,
  deleteSessionCookie,
  RETURN_TO_COOKIE_NAME,
} from "./auth.ts";
import { getMps } from "./db.ts";
import { createLogger } from "./log.ts";
import { get } from "./config.ts";

const logger = createLogger("main");
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
app.use(cookieParser());
app.use("/static", express.static("src/static"));
app.use(handleAuthentication);
app.use(
  i18nextmiddleware.handle(i18next, {
    ignoreRoutes: ["/auth"], // or function(req, res, options, i18next) { /* return true to ignore */ }
    removeLngFromUrl: false, // removes the language from the url when language detected in path
  }),
);

app.get("/:lng/start", async function (req, res) {
  const mps = await getMps();
  res.render("index", {
    mps,
    userInfo: res.locals.user.email,
    lang: req.language,
  });
});

app.get("/auth/login", async function (req, res) {
  const redirectUrl = await startLoginFlow(req, res);
  res.redirect(303, redirectUrl.href);
});

app.get("/auth/callback", async function (req, res) {
  if (isAnonymous(req) && req.query.code) {
    await continueLoginFlow(req, res);
    logger.info("user logged in");
    const returnTo = req.cookies[RETURN_TO_COOKIE_NAME];

    if (returnTo) {
      logger.info("redirecting to where user wanted to go", { returnTo });
      deleteReturnToCookie(res);
      res.render("callback", { returnTo });
    }
  } else if (isAnonymous(req) && !req.query.code) {
    logger.warn("callback without code");
    res.status(400);
    res.end();
  }
  logger.info("user already logged in, redirecting to home");
  res.render("callback", { returnTo: "/de/start" });
});

app.get("/auth/logout", async function (req, res) {
  deleteSessionCookie(res);
  res.render("logout");
});

await discoverOidcConfiguration();
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
