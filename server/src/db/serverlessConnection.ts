import mongoose from "mongoose";

export const SERVERLESS_POOL_SIZE = 5;

export type Connect = (url: string) => Promise<unknown>;

export const mongooseConnect: Connect = (url) => mongoose.connect(url, { maxPoolSize: SERVERLESS_POOL_SIZE });

export function createConnector(connect: Connect = mongooseConnect): (url: string) => Promise<void> {
  let pending: Promise<void> | null = null;
  return (url) => {
    pending ??= connect(url).then(
      () => undefined,
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}
