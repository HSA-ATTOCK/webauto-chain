import { z } from "zod";

const dueDateString = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (!value) {
        return true;
      }

      const normalized = value.length === 10 ? `${value}T00:00:00Z` : value;
      return !Number.isNaN(Date.parse(normalized));
    },
    { message: "Invalid due date" }
  );

export const ledgerEntrySchema = z.object({
  entryType: z.enum([
    "CREDIT",
    "PAYMENT",
    "ADJUSTMENT",
    "EDIT_REQUEST",
    "DELETE_REQUEST",
  ]),
  amount: z.number().positive(),
  items: z.any().optional(),
  notes: z.string().max(500).optional(),
  dueDate: dueDateString.optional(),
  supersedesId: z.string().cuid().optional(),
});

export const ledgerDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  note: z.string().max(500).optional(),
});

export const ledgerEntryUpdateSchema = z
  .object({
    amount: z.number().positive().optional(),
    notes: z.string().trim().max(500).optional().or(z.null()),
    dueDate: dueDateString.optional().or(z.null()),
    items: z.any().optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.notes !== undefined ||
      value.dueDate !== undefined ||
      value.items !== undefined,
    {
      message: "No changes provided",
      path: [],
    }
  );

export const ledgerEntryDeleteSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
