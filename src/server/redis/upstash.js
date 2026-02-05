import { Redis } from "@upstash/redis";

let redisClient;

export function getRedis() {
  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}
