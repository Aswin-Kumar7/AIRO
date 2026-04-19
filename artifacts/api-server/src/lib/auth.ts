import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { generateId } from "./id";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${process.env.APP_BASE_URL ?? "http://localhost:3001"}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  error?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId ?? "",
      client_secret: clientSecret ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = (await tokenRes.json()) as GoogleTokenResponse;
  if (tokens.error) throw new Error(`Google token exchange failed: ${tokens.error}`);

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error("Failed to fetch Google user info");

  return (await userRes.json()) as GoogleUserInfo;
}

export async function upsertUserFromGoogle(googleUser: GoogleUserInfo) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, googleUser.sub));

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ name: googleUser.name ?? null, avatarUrl: googleUser.picture ?? null })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      id: generateId(),
      googleId: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name ?? null,
      avatarUrl: googleUser.picture ?? null,
    })
    .returning();
  return created!;
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user ?? null;
}
