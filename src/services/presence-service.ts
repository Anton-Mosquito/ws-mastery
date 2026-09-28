interface RedisPublisher {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export class PresenceService {
  constructor(private readonly publisher: RedisPublisher) {}

  async addUser(roomName: string, username: string) {
    return this.publisher.sadd(`room:${roomName}:users`, username);
  }

  async removeUser(roomName: string, username: string) {
    return this.publisher.srem(`room:${roomName}:users`, username);
  }

  async getUsers(roomName: string) {
    return this.publisher.smembers(`room:${roomName}:users`);
  }
}
