export interface StatementRecency<Id> {
  id: Id;
  issuer: string;
  closingDate: Date | null;
  uploadedAt: Date;
}

const closingTime = (closingDate: Date | null): number =>
  closingDate ? closingDate.getTime() : Number.NEGATIVE_INFINITY;

const isMoreRecent = <Id>(candidate: StatementRecency<Id>, current: StatementRecency<Id>): boolean => {
  const candidateClosing = closingTime(candidate.closingDate);
  const currentClosing = closingTime(current.closingDate);
  if (candidateClosing !== currentClosing) return candidateClosing > currentClosing;
  return candidate.uploadedAt.getTime() > current.uploadedAt.getTime();
};

const newestFirst = <Id>(a: StatementRecency<Id>, b: StatementRecency<Id>): number => {
  if (isMoreRecent(a, b)) return -1;
  if (isMoreRecent(b, a)) return 1;
  return 0;
};

export const statementsBefore = <Id>(
  target: StatementRecency<Id>,
  statements: StatementRecency<Id>[],
): StatementRecency<Id>[] =>
  statements
    .filter((statement) => statement.issuer === target.issuer && isMoreRecent(target, statement))
    .sort(newestFirst);

export const latestStatementIdsPerIssuer = <Id>(statements: StatementRecency<Id>[]): Id[] => {
  const latestByIssuer = new Map<string, StatementRecency<Id>>();
  for (const statement of statements) {
    const current = latestByIssuer.get(statement.issuer);
    if (!current || isMoreRecent(statement, current)) latestByIssuer.set(statement.issuer, statement);
  }
  return [...latestByIssuer.values()].map((statement) => statement.id);
};
