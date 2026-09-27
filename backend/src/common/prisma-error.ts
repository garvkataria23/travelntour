import { Prisma } from '@prisma/client';

/**
 * True for Prisma's unique-constraint violation (P2002).
 *
 * Used to turn a check-then-act race into a get-or-create: the unique index is the real
 * arbiter, and a duplicate error just means a colleague won the insert.
 */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
