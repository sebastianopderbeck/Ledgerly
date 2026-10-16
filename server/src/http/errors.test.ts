import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { UnscopedQueryError } from "../db/userScoped.js";
import { errorMiddleware } from "./errors.js";

afterEach(() => vi.restoreAllMocks());

describe("errorMiddleware", () => {
  it("una consulta sin userId es un 500 genérico y se loguea", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/x", (_req, _res, next) => next(new UnscopedQueryError("Statement", "find")));
    app.use(errorMiddleware);
    const res = await request(app).get("/x");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Error interno" });
    expect(log).toHaveBeenCalledWith("Consulta sin userId sobre Statement (find)");
  });
});
