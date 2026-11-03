"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// useSearchParams forces dynamic rendering and must sit inside a Suspense
// boundary so Next can statically prerender the surrounding shell.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't sign in.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[420px] flex-col items-center justify-center px-6">
      <div className="eyebrow">— The Blueprint —</div>
      <h1 className="serif-h mt-2 text-[36px]">Open the door.</h1>

      <form onSubmit={submit} className="mt-6 w-full space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-sm border border-paper-line bg-paper-panel/60 px-4 py-3 text-ink outline-none focus:border-brass"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-sm border border-paper-line bg-paper-panel/60 px-4 py-3 text-ink outline-none focus:border-brass"
        />
        <button
          type="submit"
          disabled={pending}
          className="brass-button w-full px-6 py-3 font-mono text-[10px] tracking-[0.24em] disabled:opacity-50"
        >
          {pending ? "..." : "OPEN"}
        </button>
      </form>

      <div className="mt-6 min-h-[20px] text-center text-[12px]">
        {error && <p className="text-rust">⚠ {error}</p>}
      </div>

      <p className="mt-8 max-w-[320px] text-center text-[11px] text-ink-mute">
        Forgot your password? Ask Claude to set a new one for you.
      </p>
    </div>
  );
}
