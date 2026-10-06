"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";

type User = {
  id: string;
  email: string;
  userName: string;
  profileImg: string;
  fName: string;
  lName: string;
};

type AuthUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  emailAddresses: { emailAddress: string }[];
};

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.userName,
    firstName: user.fName,
    lastName: user.lName,
    imageUrl: user.profileImg,
    emailAddresses: [{ emailAddress: user.email }],
  };
}

type AuthContextValue = {
  userId: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  getToken: () => Promise<string>;
  signOut: () => Promise<void>;
  setAuthenticatedUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: User | null }>("auth.me")
      .then(({ user }) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest<{ success: boolean }>("auth.logout", { method: "POST", body: {} });
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: currentUser?.id ?? null,
      isLoaded,
      isSignedIn: currentUser !== null,
      user: currentUser ? toAuthUser(currentUser) : null,
      getToken: async () => "",
      signOut,
      setAuthenticatedUser: setCurrentUser,
    }),
    [currentUser, isLoaded, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Authentication hooks must be used within <ClerkProvider>");
  return context;
}

export function useAuth() {
  const { userId, isLoaded, isSignedIn, getToken, signOut } = useAuthContext();
  return { userId, isLoaded, isSignedIn, getToken, signOut };
}

export function useUser() {
  const { user, isLoaded, isSignedIn } = useAuthContext();
  return { user, isLoaded, isSignedIn };
}

export function SignIn(_props: { forceRedirectUrl?: string }) {
  return <AccountForm mode="sign-in" />;
}

export function SignUp(_props: { forceRedirectUrl?: string }) {
  return <AccountForm mode="sign-up" />;
}

function AccountForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { setAuthenticatedUser } = useAuthContext();
  const [form, setForm] = useState({ email: "", password: "", userName: "", fName: "", lName: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const action = mode === "sign-in" ? "auth.login" : "auth.register";
      const result = await apiRequest<{ user: User }>(action, { body: form });
      setAuthenticatedUser(result.user);
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <h1 className="text-lg font-semibold mb-1">
        {mode === "sign-in" ? "Sign in" : "Create an account"}
      </h1>
      <p className="text-xs mb-4" style={{ color: "var(--fg-muted)" }}>
        {mode === "sign-in" ? "Use your CommonGround account." : "Create your CommonGround account."}
      </p>
      <form className="flex flex-col gap-2" onSubmit={submit}>
        {mode === "sign-up" && (
          <>
            <input
              autoComplete="username"
              placeholder="Username"
              value={form.userName}
              onChange={(event) => setForm((value) => ({ ...value, userName: event.target.value }))}
              className="px-3 py-2 rounded-lg border text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              required
            />
            <div className="flex gap-2">
              <input
                autoComplete="given-name"
                placeholder="First name"
                value={form.fName}
                onChange={(event) => setForm((value) => ({ ...value, fName: event.target.value }))}
                className="px-3 py-2 rounded-lg border text-sm bg-transparent flex-1"
                style={{ borderColor: "var(--border)" }}
              />
              <input
                autoComplete="family-name"
                placeholder="Last name"
                value={form.lName}
                onChange={(event) => setForm((value) => ({ ...value, lName: event.target.value }))}
                className="px-3 py-2 rounded-lg border text-sm bg-transparent flex-1"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </>
        )}
        <input
          autoComplete="email"
          placeholder="Email"
          value={form.email}
          onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
          className="px-3 py-2 rounded-lg border text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          type="email"
          required
        />
        <input
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
          className="px-3 py-2 rounded-lg border text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          type="password"
          minLength={mode === "sign-up" ? 8 : undefined}
          required
        />
        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {submitting ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}