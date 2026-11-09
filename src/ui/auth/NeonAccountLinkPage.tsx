import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserAuthClient } from "./browser-auth-client";

type Owner = { owner_id: string; email: string | null };
const pendingKey = "clawdeals.neon_link_owner";
async function operation(action: string, body = {}, token?: string) {
  const response = await fetch(`/api/v1/auth/neon:${action}`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Clawdeals-Link": "1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  return payload.data;
}

/** Isolated migration flow: never invokes signup, email delivery, logout or bridge. */
export default function NeonAccountLinkPage() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const [message, setMessage] = useState("Checking your existing ClawDeals session…");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const current = await operation("link-status");
        if (cancelled) return;
        const previous = sessionStorage.getItem(pendingKey);
        if (previous && previous !== current.owner_id) throw new Error("The current owner changed. Cancel this linking attempt and review your account.");
        setOwner(current);
        const auth = getBrowserAuthClient().auth;
        let result = await auth.getSession();
        const code = new URL(window.location.href).searchParams.get("code");
        if (!result.data?.session && code) result = await auth.exchangeCodeForSession(code);
        if (result.error) throw result.error;
        const session = result.data?.session;
        if (!cancelled) { setIdentity(session?.user?.email || session?.user?.id || null); setMessage("Your existing account stays signed in. Sign in to Neon, then confirm the link below."); }
        if (code) window.history.replaceState(null, "", window.location.pathname);
      } catch (error: any) { if (!cancelled) setMessage(error.message); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  function rememberOwner() {
    if (!owner) throw new Error("Your existing owner session is required.");
    sessionStorage.setItem(pendingKey, owner.owner_id);
  }
  return <main className="mx-auto max-w-xl p-6 space-y-4">
    <h1>Link your existing account to Neon</h1>
    <p role="status">{message}</p>
    {owner && <>
      <p>Current ClawDeals owner: <strong>{owner.email || owner.owner_id}</strong></p>
      <p>Owner ID: {owner.owner_id}</p>
      <p>Use this same browser and origin. Do not copy cookies or tokens to a preview. Linking preserves your owner ID and previous identity.</p>
      {!done && <>
        <form onSubmit={event => { event.preventDefault(); void run(async () => {
          rememberOwner();
          let result;
          try { result = await getBrowserAuthClient().auth.signInWithPassword({ email, password }); } finally { setPassword(""); }
          if (result.error) throw result.error;
          setIdentity(result.data?.user?.email || result.data?.session?.user?.email || "Neon account");
          setMessage("Neon sign-in ready. Review both accounts and confirm below.");
        }); }}>
          <label>Neon email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Neon password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button disabled={busy} type="submit">Sign in to Neon</button>
        </form>
        <button disabled={busy} onClick={() => void run(async () => {
          rememberOwner();
          // Neon delegates redirect to Better Auth. data.url is the callback,
          // not a provider URL, so do not navigate to it ourselves.
          const result = await getBrowserAuthClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}${window.location.pathname}` } });
          if (result.error) throw result.error;
        })}>Continue with Google</button>
        {identity && <p>Neon account: {identity}</p>}
        <button disabled={busy || !identity} onClick={() => void run(async () => {
          const result = await getBrowserAuthClient().auth.getSession();
          if (result.error) throw result.error;
          const token = result.data?.session?.access_token;
          if (!token) throw new Error("Neon session expired. Sign in to Neon again; your existing ClawDeals session is unchanged.");
          await operation("link", { expected_owner_id: owner.owner_id }, token);
          sessionStorage.removeItem(pendingKey); setDone(true); setMessage("Account linked. Your owner ID and existing session were preserved.");
        })}>Confirm account link</button>
      </>}
    </>}
    <Link href="/settings/identities" onClick={() => sessionStorage.removeItem(pendingKey)}>Cancel and return to identities</Link>
  </main>;
}
