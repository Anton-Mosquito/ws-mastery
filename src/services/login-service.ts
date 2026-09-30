import { nanoid } from "nanoid";

type GetToken = (username: string, userId: string) => string;

export interface LoginResult {
  token: string;
  expiresIn: "1h";
  userId: string;
  username: string;
}

export class LoginService {
  constructor(private readonly getToken: GetToken) {}

  login(
    usernameParam?: string | null,
    userIdParam?: string | null,
  ): LoginResult {
    const username = usernameParam?.trim() || `Гість-${nanoid(4)}`;

    const userId = userIdParam?.trim() || nanoid(8);

    const token = this.getToken(username, userId);

    return {
      token,
      expiresIn: "1h",
      userId,
      username,
    };
  }
}
