import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { protectedPath, writePrivate } from "./transfer-contract.mjs";

const MAX_BYTES = 256 * 1024 * 1024;
export async function readSecrets(stream = process.stdin) {
  const chunks = []; let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 65536) throw new Error();
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      if (!value || Array.isArray(value) || typeof value !== "object" || Object.entries(value).some(([key, v]) => !["source_url", "target_url", "artifact_passphrase"].includes(key) || typeof v !== "string")) throw new Error();
      return value;
    } finally { bytes.fill(0); }
  } catch { throw new Error("Invalid private stdin input"); }
  finally { for (const chunk of chunks) chunk.fill(0); }
}
export function runBuffered(command, args, { input, secret, env = process.env, limit = MAX_BYTES, timeout = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []; let length = 0, failed = false;
    const child = spawn(command, args, { env, shell: false, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    const fail = () => { failed = true; child.kill("SIGKILL"); };
    const timer = setTimeout(fail, timeout);
    child.on("error", fail);
    child.stdin.on("error", () => {});
    child.stdio[3].on("error", () => {});
    child.stderr.on("data", chunk => chunk.fill(0));
    child.stdout.on("data", chunk => { length += chunk.length; if (length > limit) { chunk.fill(0); fail(); } else chunks.push(chunk); });
    child.on("close", code => {
      clearTimeout(timer);
      const output = failed || code !== 0 ? null : Buffer.concat(chunks);
      for (const chunk of chunks) chunk.fill(0);
      if (output) resolve(output); else reject(new Error("Local transfer subprocess failed; details suppressed to protect secrets"));
    });
    child.stdin.end(input);
    child.stdio[3].end(secret);
  });
}
async function crypt(bytes, key, decrypt = false) {
  if (typeof key !== "string" || Buffer.byteLength(key) < 32 || /[\r\n\0]/.test(key)) throw new Error("Shared in-memory passphrase of at least 32 bytes required");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-gpg-"));
  fs.chmodSync(home, 0o700);
  const secret = Buffer.from(`${key}\n`);
  try {
    return await runBuffered("gpg", ["--homedir", home, "--batch", "--no-tty", "--no-options", "--pinentry-mode", "loopback", "--passphrase-fd", "3", "--no-symkey-cache", ...(decrypt ? ["--decrypt"] : ["--symmetric", "--cipher-algo", "AES256", "--s2k-digest-algo", "SHA512"])], { input: bytes, secret });
  } finally {
    secret.fill(0);
    try { await runBuffered("gpgconf", ["--homedir", home, "--kill", "gpg-agent"]); }
    finally { fs.rmSync(home, { recursive: true, force: true }); }
  }
}
export async function writeEncrypted(file, bytes, key) {
  if (!file.endsWith(".gpg")) throw new Error("Encrypted artifact suffix required");
  const encrypted = await crypt(bytes, key);
  try { writePrivate(file, encrypted); } finally { encrypted.fill(0); }
}
export async function readEncrypted(file, key) {
  if (!file.endsWith(".gpg")) throw new Error("Encrypted artifact suffix required");
  const encrypted = fs.readFileSync(protectedPath(file));
  try { return await crypt(encrypted, key, true); } finally { encrypted.fill(0); }
}
