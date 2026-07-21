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

export const latestStatementIdsPerIssuer = <Id>(statements: StatementRecency<Id>[]): Id[] => {
  const latestByIssuer = new Map<string, StatementRecency<Id>>();
  for (const statement of statements) {
    const current = latestByIssuer.get(statement.issuer);
    if (!current || isMoreRecent(statement, current)) latestByIssuer.set(statement.issuer, statement);
  }
  return [...latestByIssuer.values()].map((statement) => statement.id);
};
