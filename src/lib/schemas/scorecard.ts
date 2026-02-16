import { z } from "zod";

const RiskLevel = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]);

const SourceDocument = z.enum(["tos", "privacy", "dpa", "subprocessor", "other"]);

const FindingSchema = z.object({
  title: z.string().describe("Short title of the finding, e.g. 'AI Training on Customer Data'"),
  severity: RiskLevel.describe("Risk severity of this specific finding"),
  detected: z.boolean().describe("Whether this risk was detected in the documents"),
  evidence: z
    .string()
    .describe("Direct quote from the source document. Must be a verbatim excerpt, not a paraphrase."),
  sourceDocument: SourceDocument.describe("Which document this finding was extracted from"),
  explanation: z
    .string()
    .describe("Plain-English explanation of why this matters and what the risk is"),
  frameworkRef: z
    .string()
    .describe(
      "Relevant compliance framework reference, e.g. 'GDPR Art. 28', 'SOC 2 CC6.1', 'NIST CSF PR.DS-5'"
    ),
});

const CategoryResultSchema = z.object({
  riskLevel: RiskLevel.describe("Overall risk level for this category"),
  findings: z.array(FindingSchema).describe("Individual findings in this category"),
});

export const ScorecardSchema = z.object({
  vendor: z.string().describe("The vendor name or domain being analyzed"),
  analyzedAt: z.string().describe("ISO 8601 timestamp of the analysis"),
  overallRiskLevel: RiskLevel.describe(
    "Overall risk level across all categories. CRITICAL if any category is CRITICAL."
  ),
  categories: z.object({
    aiTraining: CategoryResultSchema.describe(
      "Findings related to AI/ML model training on customer data"
    ),
    subProcessors: CategoryResultSchema.describe(
      "Findings related to third-party AI sub-processors and data sharing"
    ),
    telemetryRetention: CategoryResultSchema.describe(
      "Findings related to telemetry collection, data retention, and deletion policies"
    ),
  }),
  summary: z
    .string()
    .describe("2-3 sentence executive summary of the overall risk posture for a CISO audience"),
});

export type Scorecard = z.infer<typeof ScorecardSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type CategoryResult = z.infer<typeof CategoryResultSchema>;
