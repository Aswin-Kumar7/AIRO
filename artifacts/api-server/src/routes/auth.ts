import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  upsertUserFromGoogle,
  getUserById,
} from "../lib/auth";

const router: IRouter = Router();

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? process.env.NEXT_PUBLIC_FRONTEND_URL ?? "http://localhost:5173";
}

router.get("/auth/google", (req, res): void => {
  const { clientId } = { clientId: process.env.GOOGLE_CLIENT_ID };
  if (!clientId) {
    res.status(503).json({ error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  res.redirect(buildGoogleAuthUrl(state));
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const frontendUrl = getFrontendUrl();

  if (error) {
    res.redirect(`${frontendUrl}/?auth=error&message=${encodeURIComponent(error)}`);
    return;
  }

  const savedState = req.session.oauthState;
  if (!state || !savedState || state !== savedState) {
    res.redirect(`${frontendUrl}/?auth=error&message=invalid_state`);
    return;
  }

  delete req.session.oauthState;

  if (!code) {
    res.redirect(`${frontendUrl}/?auth=error&message=no_code`);
    return;
  }

  try {
    const googleUser = await exchangeGoogleCode(code);
    const user = await upsertUserFromGoogle(googleUser);
    req.session.userId = user.id;
    req.session.save((saveErr: unknown) => {
      if (saveErr) console.error("Session save failed", saveErr);
    });
    res.redirect(`${frontendUrl}/?auth=success`);
  } catch (err) {
    console.error("Google OAuth callback failed", err);
    const msg = err instanceof Error ? err.message : "oauth_failed";
    res.redirect(`${frontendUrl}/?auth=error&message=${encodeURIComponent(msg)}`);
  }
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

export default router;
