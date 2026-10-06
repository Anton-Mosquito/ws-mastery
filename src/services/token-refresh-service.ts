import type {
  TokenPayload,
  VerifyToken,
  TokenRefreshResult,
} from "../types/index.js";

export class TokenRefreshService {
  constructor(private readonly verifyToken: VerifyToken) {}

  refresh(
    currentPayload: TokenPayload,
    currentUsername: string,
    token: string,
  ): TokenRefreshResult {
    let refreshedPayload: TokenPayload;

    try {
      refreshedPayload = this.verifyToken(token);
    } catch {
      return {
        success: false,
        reason: "invalid_token",
      };
    }

    if (
      refreshedPayload.userId !== currentPayload.userId ||
      refreshedPayload.username !== currentUsername
    ) {
      return {
        success: false,
        reason: "identity_mismatch",
      };
    }

    return {
      success: true,
      payload: refreshedPayload,
    };
  }
}
