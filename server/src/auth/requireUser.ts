import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isValidObjectId, type Types } from "mongoose";
import { HttpError, asyncHandler } from "../http/errors.js";
import { UserModel } from "../db/models.js";
import type { AuthConfig } from "./authConfig.js";
import { SESSION_COOKIE, verifySession } from "./sessionToken.js";

export interface SessionUser {
  id: Types.ObjectId;
  email: string;
  name: string;
  isOwner: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_REQUIRED = "Sesión vencida o inexistente";
export const OWNER_ONLY = "Solo el dueño puede importar por mail";
export const FOREIGN_ORIGIN = "Origen no permitido";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireUser(config: AuthConfig): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const userId = await verifySession(req.cookies?.[SESSION_COOKIE], config.sessionSecret);
    const user = userId !== null && isValidObjectId(userId) ? await UserModel.findById(userId).lean() : null;
    if (!user || !config.allowedEmails.has(user.email)) throw new HttpError(401, SESSION_REQUIRED);
    req.user = { id: user._id, email: user.email, name: user.name, isOwner: user.email === config.ownerEmail };
    next();
  });
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, SESSION_REQUIRED);
  return req.user;
}

export const userIdOf = (req: Request): Types.ObjectId => currentUser(req).id;

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  next(currentUser(req).isOwner ? undefined : new HttpError(403, OWNER_ONLY));
}

export function checkOrigin({ publicUrl }: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get("origin");
    const foreign = MUTATING_METHODS.has(req.method) && origin !== undefined && origin !== publicUrl;
    next(foreign ? new HttpError(403, FOREIGN_ORIGIN) : undefined);
  };
}
