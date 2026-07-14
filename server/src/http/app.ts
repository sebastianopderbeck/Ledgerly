import express from "express";
import cors from "cors";
import { errorMiddleware, HttpError } from "./errors.js";
import { statementsRouter } from "./routes/statements.js";
import { transactionsRouter } from "./routes/transactions.js";
import { categoryRulesRouter } from "./routes/categoryRules.js";
import { statsRouter } from "./routes/stats.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/statements", statementsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/category-rules", categoryRulesRouter);
  app.use("/api/stats", statsRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
