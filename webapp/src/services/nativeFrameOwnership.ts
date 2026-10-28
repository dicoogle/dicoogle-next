interface NativeFrameAuthUser {
  readonly user?: string;
}

export interface NativeFrameOwnership {
  readonly ownerId: string;
  readonly principalId: string;
}

const owners = new WeakMap<object, string>();
let ownerSequence = 0;

export function resolveNativeFrameOwnership(
  user: NativeFrameAuthUser | null,
  isAuthenticated: boolean,
): NativeFrameOwnership | null {
  if (!isAuthenticated || !user || typeof user !== "object") {
    return null;
  }
  const principalId = typeof user.user === "string" ? user.user.trim() : "";
  if (!principalId) {
    return null;
  }
  let ownerId = owners.get(user);
  if (!ownerId) {
    ownerId = `auth-owner-${++ownerSequence}`;
    owners.set(user, ownerId);
  }
  return Object.freeze({ ownerId, principalId });
}
