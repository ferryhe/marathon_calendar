import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { mkdirSync } from "fs";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { log } from "./logger";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startSyncScheduler } from "./syncScheduler";

const app = express();
const httpServer = createServer(app);
const MemoryStore = createMemoryStore(session);
const PgStore = connectPgSimple(session);

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

const sessionSecret =
  sessionSecretEnv ?? "marathon-dev-session-secret-change-me";

if (!sessionSecretEnv && !isProduction) {
  console.warn(
    'Using default development SESSION_SECRET. Do not use this value in production.',
  );
}

// Configure session store based on environment
// In production, use PostgreSQL for persistent, shared session storage
// In development, use in-memory store for simplicity
let sessionStore;
if (isProduction && process.env.DATABASE_URL) {
  const pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  sessionStore = new PgStore({
    pool: pgPool,
    createTableIfMissing: true,
    tableName: "user_sessions",
  });
  console.log('Using PostgreSQL session store for production');
} else {
  sessionStore = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000,
  });
  if (isProduction) {
    console.warn(
      'WARNING: Using in-memory session store in production. Sessions will be lost on restart. ' +
      'Set DATABASE_URL to use persistent PostgreSQL session storage.'
    );
  }
}

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
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
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
