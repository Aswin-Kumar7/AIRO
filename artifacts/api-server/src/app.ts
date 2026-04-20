import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const DEV_SECRET = "dev-session-secret-change-in-production";
const SESSION_SECRET = process.env.SESSION_SECRET ?? DEV_SECRET;

if (process.env.NODE_ENV === "production" && SESSION_SECRET === DEV_SECRET) {
  throw new Error("CRITICAL: SESSION_SECRET must be set in production to prevent session forgery.");
}

// Routes that don't require authentication
const PUBLIC_ROUTE_PREFIXES = [
  "/api/health",
  "/api/auth/",
  "/api/shopify/install",
  "/api/shopify/callback",
  "/api/shopify/webhooks/",
];

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const isPublic = PUBLIC_ROUTE_PREFIXES.some((prefix) => req.path.startsWith(prefix));
  if (isPublic) { next(); return; }
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    return;
  }
  next();
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:5173",
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error("CORS: origin not allowed"));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(session({
  name: "sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));
app.use(express.json({
  verify: (req: import("express").Request & { rawBody?: Buffer }, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use(requireAuth);
app.use("/api", router);

export default app;
