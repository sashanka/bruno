import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompt";

describe("buildUserPrompt", () => {
  it("includes the vendor name", () => {
    const result = buildUserPrompt("acme.com", "some text");
    expect(result).toContain('vendor "acme.com"');
  });

  it("includes the combined text", () => {
    const text = "--- BEGIN TOS ---\nHello world\n--- END TOS ---";
    const result = buildUserPrompt("acme.com", text);
    expect(result).toContain(text);
  });
});

describe("SYSTEM_PROMPT", () => {
  it("contains the AI Training section", () => {
    expect(SYSTEM_PROMPT).toContain("AI Training");
    expect(SYSTEM_PROMPT).toContain("aiTraining");
  });

  it("contains the Sub-Processors section", () => {
    expect(SYSTEM_PROMPT).toContain("Sub-Processors");
    expect(SYSTEM_PROMPT).toContain("subProcessors");
  });

  it("contains the Telemetry Retention section", () => {
    expect(SYSTEM_PROMPT).toContain("Telemetry Retention");
    expect(SYSTEM_PROMPT).toContain("telemetryRetention");
  });

  it("contains severity criteria", () => {
    expect(SYSTEM_PROMPT).toContain("CRITICAL");
    expect(SYSTEM_PROMPT).toContain("HIGH");
    expect(SYSTEM_PROMPT).toContain("MEDIUM");
    expect(SYSTEM_PROMPT).toContain("LOW");
    expect(SYSTEM_PROMPT).toContain("NONE");
  });
});
