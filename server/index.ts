import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { mkdirSync } from "fs";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { ZodError } from "zod";
import { log } from "./logger";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startSyncScheduler } from "./syncScheduler";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);
const MemoryStore = createMemoryStore(session);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    username?: string;
    displayName?: string;
  }
}

const isProduction = process.env.NODE_ENV === "production";
const sessionSecretEnv = process.env.SESSION_SECRET;

if (!sessionSecretEnv && isProduction) {
  throw new Error(
    "SESSION_SECRET environment variable must be set when NODE_ENV=production",
  );
}

const sessionSecret = sessionSecretEnv ?? "marathon-dev-session-secret-change-me";
if (!sessionSecretEnv && !isProduction) {
  console.warn(
    "Using default development SESSION_SECRET. Do not use this value in production.",
  );
}

const sessionStore = (() => {
  if (!isProduction) {
    return new MemoryStore({
      checkPeriod: 24 * 60 * 60 * 1000,
    });
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL must be set when NODE_ENV=production (required for Postgres-backed session store).",
    );
  }

  const PgSessionStore = connectPgSimple(session);
  return new PgSessionStore({
    pool,
    // Keep a stable table name so we can manage/clean it in production if needed.
    tableName: "mc_sessions",
    createTableIfMissing: true,
  });
})();

app.use(
  session({
    name: "mc.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    store: sessionStore,
  }),
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const uploadsRoot = path.resolve(process.cwd(), "uploads");
const avatarDir = path.join(uploadsRoot, "avatars");
mkdirSync(avatarDir, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  const stopScheduler = startSyncScheduler();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const isZodError = err instanceof ZodError;
    const status = isZodError ? 400 : err.status || err.statusCode || 500;
    const message = isZodError ? "Validation error" : err.message || "Internal Server Error";
    const printableError =
      err instanceof Error
        ? (err.stack ?? err.message)
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
    console.error("Internal Server Error:", printableError);

    if (res.headersSent) {
      return next(err);
    }

    if (isZodError) {
      return res.status(status).json({ message, issues: err.issues });
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.platform === "win32" ? "127.0.0.1" : "0.0.0.0";
  const listenOptions =
    process.platform === "win32"
      ? { port, host }
      : { port, host, reusePort: true };

  // `reusePort` is unsupported on Windows (ENOTSUP), but helpful on Linux.
  httpServer.listen(
    listenOptions,
    () => {
      log(`serving on port ${port}`);
    },
  );

  httpServer.on("close", () => {
    stopScheduler();
  });
})();
