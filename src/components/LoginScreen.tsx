"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else {
        setError("Sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg p-6 space-y-4"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h1
          className="text-xl font-semibold text-center"
          style={{ color: "var(--color-text-primary)" }}
        >
          Dispatch Dashboard
        </h1>
        <p
          className="text-sm text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sign in to continue
        </p>

        {error && (
          <div
            className="px-3 py-2 rounded text-sm"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "rgb(252,165,165)",
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            className="block text-sm mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{
              background: "var(--color-input-bg)",
              border: "1px solid var(--color-input-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-sm mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{
              background: "var(--color-input-bg)",
              border: "1px solid var(--color-input-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
