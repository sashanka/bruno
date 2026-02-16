import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../url";

describe("sanitizeUrl", () => {
  it("passes through a valid HTTPS URL", () => {
    const result = sanitizeUrl("https://example.com");
    expect(result).toEqual({ url: "https://example.com", hostname: "example.com" });
  });

  it("prepends https:// to a bare domain", () => {
    const result = sanitizeUrl("openai.com");
    expect(result).toEqual({ url: "https://openai.com", hostname: "openai.com" });
  });

  it("returns the correct { url, hostname } shape", () => {
    const result = sanitizeUrl("https://sub.example.com/path?q=1");
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("hostname");
    expect(result.url).toBe("https://sub.example.com");
    expect(result.hostname).toBe("sub.example.com");
  });

  it("rejects HTTP URLs", () => {
    expect(() => sanitizeUrl("http://example.com")).toThrow("Only HTTPS URLs are allowed");
  });

  it("rejects 10.x.x.x private IPs", () => {
    expect(() => sanitizeUrl("https://10.0.0.1")).toThrow("Private or internal");
  });

  it("rejects 172.16-31.x.x private IPs", () => {
    expect(() => sanitizeUrl("https://172.16.0.1")).toThrow("Private or internal");
    expect(() => sanitizeUrl("https://172.31.255.1")).toThrow("Private or internal");
  });

  it("rejects 192.168.x.x private IPs", () => {
    expect(() => sanitizeUrl("https://192.168.1.1")).toThrow("Private or internal");
  });

  it("rejects 127.x.x.x loopback IPs", () => {
    expect(() => sanitizeUrl("https://127.0.0.1")).toThrow("Private or internal");
  });

  it("rejects 169.254.x.x link-local IPs", () => {
    expect(() => sanitizeUrl("https://169.254.1.1")).toThrow("Private or internal");
  });

  it("rejects localhost", () => {
    expect(() => sanitizeUrl("https://localhost")).toThrow("Private or internal");
  });

  it("rejects .local hostnames", () => {
    expect(() => sanitizeUrl("https://myhost.local")).toThrow("Private or internal");
  });

  it("rejects .internal hostnames", () => {
    expect(() => sanitizeUrl("https://myhost.internal")).toThrow("Private or internal");
  });

  it("rejects IPv6 loopback [::1]", () => {
    expect(() => sanitizeUrl("https://[::1]")).toThrow("Private or internal");
  });
});
