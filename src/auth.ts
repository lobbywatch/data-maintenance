import * as client from "openid-client";

import { type Request, type Response, type NextFunction } from "express";
import type {
  Configuration,
  TokenEndpointResponse,
  TokenEndpointResponseHelpers,
} from "openid-client";
import { get } from "./config.ts";
import { createLogger } from "./log.ts";
import * as crypto from "node:crypto";

const oidcServer = () => new URL(get("oidc_server"));
const oidcClientId = () => get("oidc_client_id");
const appBaseUrl = () => get("base_url");
const scope = "openid email profile";
const SESSION_COOKIE_NAME = "session";
const CODE_VERIFIER_COOKIE_NAME = "code_verifier";
export const RETURN_TO_COOKIE_NAME = "return_to";

type CookieOpts = {
  path: string;
  httpOnly: true;
  sameSite: "lax" | "strict";
  secure: true;
};

const codeVerifierCookieOpts: CookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: true,
};

const sessionCookieOpts: CookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "strict",
  secure: true,
};

const returnToCookieOpts: CookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "strict",
  secure: true,
};

const SESSIONS = new Map<string, { accessToken: string; sub: string }>();

const logger = createLogger("auth");
let config: Configuration;

function getConfig() {
  if (!config) {
    throw new Error("OIDC configuration not discovered yet");
  }
  return config;
}

export async function discoverOidcConfiguration() {
  config = await client.discovery(oidcServer(), oidcClientId());
}

export const handleAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.debug("running auth middleware", {
    url: req.originalUrl,
  });
  if (isAnonymous(req) && isNotOnPublicPath(req)) {
    logger.debug("needs auth", { url: req.originalUrl });
    if (isApiCall(req)) {
      logger.debug("is API call", { url: req.originalUrl });
      res.status(401);
      return;
    }
    logger.debug("redirect to login", { url: req.originalUrl });
    redirectToLogin(req, res);
    return;
  } else if (hasSession(req)) {
    try {
      const userInfo = await getUserInfo(req);
      res.locals.user = {
        ...userInfo,
      };
    } catch (err) {
      console.error(err);
      deleteSessionCookie(res);
      redirectToLogin(req, res);
    }
  }

  logger.debug("calling next middleware", { url: req.originalUrl });

  next();
};

export function isAnonymous(req: Request): boolean {
  return !hasSession(req);
}

export function hasSession(req: Request): boolean {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return false;
  }
  return SESSIONS.has(sessionId);
}

function isNotOnPublicPath(req: Request): boolean {
  return !(
    req.originalUrl.startsWith("/auth/login") ||
    req.originalUrl.startsWith("/auth/callback") ||
    req.originalUrl.startsWith("/auth/logout") ||
    req.originalUrl.startsWith("/.well-known/") ||
    req.originalUrl === "/favicon.ico"
  );
}

function isApiCall(req: Request): boolean {
  return req.originalUrl.includes("/api/");
}

function redirectToLogin(req: Request, res: Response) {
  res.redirect(
    307,
    `/auth/login?return_to=${encodeURIComponent(req.originalUrl)}`,
  );
}

export function deleteSessionCookie(res: Response) {
  logger.debug("clearing session cookie");
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOpts);
}

async function getUserInfo(
  req: Request,
): Promise<{ email: string; firstName: string; lastName: string }> {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    throw new Error("session cookie must not be empty");
  }

  if (!SESSIONS.has(sessionId)) {
    throw new Error("unknown session");
  }

  const { sub, accessToken } = SESSIONS.get(sessionId)!;
  const userInfo = await client.fetchUserInfo(getConfig(), accessToken, sub);
  if (!userInfo.email) {
    throw new Error("email must not be empty");
  }
  return {
    email: userInfo.email,
    firstName: userInfo.given_name,
    lastName: userInfo.family_name,
  };
}

export async function startLoginFlow(
  req: Request,
  res: Response,
): Promise<URL> {
  logger.info("start auth");
  const { redirectUrl, codeVerifier } = await prepareAuth();
  logger.debug("set cookies");
  setCodeVerifierCookie(res, codeVerifier);
  setReturnToCookie(req, res);
  return redirectUrl;
}

async function prepareAuth() {
  logger.info("prepare auth");
  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);

  const redirectUri = new URL(`/auth/callback`, appBaseUrl());

  const redirectUrl = client.buildAuthorizationUrl(getConfig(), {
    redirect_uri: redirectUri.href,
    scope,
    code_challenge,
    code_challenge_method: "S256",
  });
  return { redirectUrl, codeVerifier: code_verifier };
}

function setCodeVerifierCookie(res: Response, codeVerifier: string) {
  res.cookie(CODE_VERIFIER_COOKIE_NAME, codeVerifier, codeVerifierCookieOpts);
}

function setReturnToCookie(req: Request, res: Response): void {
  const returnTo = req.query[RETURN_TO_COOKIE_NAME];
  if (returnTo) {
    res.cookie(RETURN_TO_COOKIE_NAME, returnTo, returnToCookieOpts);
  }
}

export function deleteReturnToCookie(res: Response) {
  logger.debug("clearing return_to cookie");
  res.clearCookie(RETURN_TO_COOKIE_NAME, returnToCookieOpts);
}

export async function continueLoginFlow(req: Request, res: Response) {
  logger.debug("continuing login", { url: req.originalUrl });
  try {
    const url = new URL(req.originalUrl, get("base_url"));
    const code_verifier = req.cookies[CODE_VERIFIER_COOKIE_NAME];
    const tokens = await client.authorizationCodeGrant(getConfig(), url, {
      pkceCodeVerifier: code_verifier,
    });
    logger.debug("got tokens from authorization server");
    setSessionCookie(tokens, res);
  } catch (err) {
    // Sentry.captureException(err);
    // TODO
    console.error(err);
  } finally {
    deleteCodeVerifierCookie(res);
  }
}

function setSessionCookie(
  tokens: TokenEndpointResponse & TokenEndpointResponseHelpers,
  res: Response,
) {
  const claims = tokens.claims();
  if (!claims) {
    throw new Error("No claims in tokens.");
  }
  const buf = crypto.randomBytes(64);
  const sessionId = buf.toString("hex");
  SESSIONS.set(sessionId, {
    sub: claims.sub,
    accessToken: tokens.access_token,
  });
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    ...sessionCookieOpts,
    maxAge: 1000 * 60 * 60, //tokens.expiresIn(),
  });
}

function deleteCodeVerifierCookie(res: Response) {
  logger.debug("clearing code verifier cookie");
  res.clearCookie(CODE_VERIFIER_COOKIE_NAME, codeVerifierCookieOpts);
}

export const handleAuthorization = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (hasSession(req) && isNotOnPublicPath(req)) {
    return res.status(404);
  }

  next();
};
