import { z } from "zod";

export const AnalyzeRequestSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .describe("The vendor URL to analyze"),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
