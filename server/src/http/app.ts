import express from "express";
import cors from "cors";
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
import { gmailRouter } from "./routes/gmail.js";
import { budgetsRouter } from "./routes/budgets.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
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
  app.use("/api/gmail", gmailRouter);
  app.use("/api/budgets", budgetsRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
