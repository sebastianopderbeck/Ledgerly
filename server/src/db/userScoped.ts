import type { Aggregate, MongooseQueryMiddleware, Query, Schema } from "mongoose";

export class UnscopedQueryError extends Error {
  constructor(model: string, operation: string) {
    super(`Consulta sin userId sobre ${model} (${operation})`);
    this.name = "UnscopedQueryError";
  }
}

const SCOPED_OPERATIONS: MongooseQueryMiddleware[] = [
  "find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "countDocuments",
  "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne", "distinct",
];

const hasUserId = (filter: Record<string, unknown> | undefined): boolean => filter?.userId !== undefined;

export function userScoped(schema: Schema): void {
  for (const operation of SCOPED_OPERATIONS) {
    schema.pre(operation, { document: false, query: true }, function guardQuery(this: Query<unknown, unknown>) {
      if (!hasUserId(this.getFilter())) throw new UnscopedQueryError(this.model.modelName, operation);
    });
  }
  schema.pre("aggregate", function guardAggregate(this: Aggregate<unknown>) {
    const [first] = this.pipeline();
    const match = first && "$match" in first ? (first.$match as Record<string, unknown>) : undefined;
    if (!hasUserId(match)) throw new UnscopedQueryError(this.model().modelName, "aggregate");
  });
}
