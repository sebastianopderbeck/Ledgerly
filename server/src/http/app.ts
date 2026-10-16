import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware, HttpError } from "./errors.js";
import { statementsRouter } from "./routes/statements.js";
import { transactionsRouter } from "./routes/transactions.js";
import { categoryRulesRouter } from "./routes/categoryRules.js";
import { statsRouter } from "./routes/stats.js";
import { creditsRouter } from "./routes/credits.js";
import { autoRouter } from "./routes/auto.js";
import { payslipsRouter } from "./routes/payslips.js";
import { inflationRouter } from "./routes/inflation.js";
import { fxRouter } from "./routes/fx.js";
import { macroRouter } from "./routes/macro.js";
import { importRouter } from "./routes/import.js";
import { importsRouter } from "./routes/imports.js";
import { statementReviewRouter } from "./routes/statementReview.js";
import { cashFlowRouter } from "./routes/cashFlow.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { netWorthRouter } from "./routes/netWorth.js";
import { mailRouter } from "./routes/mail.js";
import { budgetsRouter } from "./routes/budgets.js";
import { fixedServicesRouter } from "./routes/fixedServices.js";
import type { AuthConfig } from "../auth/authConfig.js";
import { createAuthRouter } from "../auth/authRouter.js";
import { createGoogleAuthClient, type GoogleAuthClient } from "../auth/googleClient.js";
import { checkOrigin, requireOwner, requireUser } from "../auth/requireUser.js";

export interface AppDeps {
  google?: GoogleAuthClient;
}

export function createApp(config: AuthConfig, { google = createGoogleAuthClient(config) }: AppDeps = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", checkOrigin(config));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/auth", createAuthRouter({ config, google }));
  app.use("/api", requireUser(config));
  app.use("/api/statements/:id/review", statementReviewRouter);
  app.use("/api/statements", statementsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/category-rules", categoryRulesRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/credits", creditsRouter);
  app.use("/api/auto", autoRouter);
  app.use("/api/payslips", payslipsRouter);
  app.use("/api/inflation", inflationRouter);
  app.use("/api/fx", fxRouter);
  app.use("/api/macro", macroRouter);
  app.use("/api/cash-flow", cashFlowRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/net-worth", netWorthRouter);
  app.use("/api/import", importRouter);
  app.use("/api/imports", importsRouter);
  app.use("/api/mail", requireOwner, mailRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/fixed-services", fixedServicesRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
