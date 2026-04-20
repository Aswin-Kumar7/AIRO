import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}
