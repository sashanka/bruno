import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { sanitizeUrl } from "@/lib/utils/url";

const AddVendorSchema = z.object({
  url: z.string().min(1, "URL is required"),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  const { orgId, orgSlug } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parsed = AddVendorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  let sanitized: { url: string; hostname: string };
  try {
    sanitized = sanitizeUrl(parsed.data.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const workspace = await resolveWorkspace(orgId, orgSlug ?? orgId);

  try {
    const vendor = await prisma.vendor.create({
      data: {
        workspaceId: workspace.id,
        url: sanitized.url,
        hostname: sanitized.hostname,
        name: parsed.data.name ?? null,
      },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "This vendor URL is already in your workspace" },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { clerkOrgId: orgId },
    include: {
      vendors: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json(workspace?.vendors ?? []);
}
