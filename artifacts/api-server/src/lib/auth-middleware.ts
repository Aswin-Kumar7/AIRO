/**
 * Express authentication middleware — single source of truth for session checks.
 *
 * Usage in routes:
 *   router.get("/path", requireAuth, async (req, res) => {
 *     const userId = res.locals.userId as string;  // guaranteed present
 *   });
 *
 * The router.param("storeId") in routes/index.ts applies requireAuth automatically
 * for every route that includes a :storeId path parameter, so the majority of
 * handlers don't need to call requireAuth individually.
 */
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that enforces an active user session.
 * Sets `res.locals.userId` on success; sends 401 on failure.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.locals.userId = userId;
  next();
}
