/**
 * Reply shapes for every model call. Claude enforces them with structured outputs, Gemini gets them
 * as responseJsonSchema. Structured outputs need an object root, so lists are wrapped ({"items": [...]})
 * and unwrapped by parseList.
 */
import { z } from "zod";

const list = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

export const AnswersSchema = list(z.string());

export const UsefulnessSchema = list(z.object({ score: z.number(), why: z.string() }));

export const JudgeSchema = list(z.object({ overlap: z.number(), closest: z.number(), why: z.string() }));

export const IdeasSchema = list(z.object({ idea: z.string(), move: z.string() }));

export const HybridsSchema = list(z.object({ idea: z.string(), from_a: z.string(), from_b: z.string() }));

export const ExplainSchema = z.object({
  cliched: z.string(),
  different: z.string(),
  technique: z.string(),
  move: z.string(),
  rewrite: z.string(),
});
