import { prisma } from "@/lib/db/client";
import type { Workspace } from "@prisma/client";

/**
 * Resolves a Workspace record from a Clerk organization ID.
 * Creates the workspace lazily on first encounter (upsert).
 */
export async function resolveWorkspace(
  clerkOrgId: string,
  orgName: string
): Promise<Workspace> {
  if (!clerkOrgId) {
    throw new Error("clerkOrgId is required to resolve a workspace");
  }

  return prisma.workspace.upsert({
    where: { clerkOrgId },
    update: { name: orgName },
    create: { clerkOrgId, name: orgName },
  });
}
