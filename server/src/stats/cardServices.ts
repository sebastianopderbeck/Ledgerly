import type { CardServiceDTO, Currency, Direction, Issuer, TxType } from "@ledgerly/shared";
import { groupHasMark, merchantDisplayName, merchantGroups, merchantKey } from "./merchantKey.js";

export interface CardServiceTx {
  statementId: string;
  date: string;
  merchant: string;
  amount: number;
  currency: Currency;
  direction: Direction;
  type: TxType;
  isInstallment: boolean;
  issuer: Issuer;
  cardLabel: string;
}

export interface CardServiceGroup {
  key: string;
  charges: CardServiceTx[];
}

const roundCents = (value: number): number => Math.round(value * 100) / 100;

const byDate = (a: CardServiceTx, b: CardServiceTx): number => a.date.localeCompare(b.date);

export const isCardServiceCharge = ({ type, direction, isInstallment, currency, amount }: CardServiceTx): boolean =>
  type === "purchase" && direction === "debit" && !isInstallment && currency === "ARS" && amount > 0;

export function cardServiceGroups(txs: CardServiceTx[], marks: ReadonlySet<string>): CardServiceGroup[] {
  const charges = txs.filter(isCardServiceCharge).map((tx) => ({ tx, rawKey: merchantKey(tx.merchant) }));
  return [...merchantGroups(charges.map(({ rawKey }) => rawKey))]
    .filter(([key, variants]) => groupHasMark(key, variants, marks))
    .map(([key, variants]) => ({
      key,
      charges: charges.filter(({ rawKey }) => variants.has(rawKey)).map(({ tx }) => tx).sort(byDate),
    }));
}

export function toCardServiceDTO({ key, charges }: CardServiceGroup): CardServiceDTO {
  const last = charges.reduce((latest, charge) => (charge.date > latest.date ? charge : latest));
  const lastStatement = charges.filter((charge) => charge.statementId === last.statementId);
  return {
    key,
    nombre: merchantDisplayName(last.merchant),
    issuer: last.issuer,
    cardLabel: last.cardLabel,
    ultimoMonto: roundCents(lastStatement.reduce((total, charge) => total + charge.amount, 0)),
    ultimoCargo: last.date,
  };
}

export const cardServiceList = (groups: CardServiceGroup[]): CardServiceDTO[] =>
  groups.map(toCardServiceDTO).sort((a, b) => a.nombre.localeCompare(b.nombre));
