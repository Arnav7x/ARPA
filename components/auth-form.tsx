"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Layers, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { BackgroundAnimation } from "@/components/background-animation";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const profile = {
      name: name || (email ? email.split("@")[0] : "Lead Researcher"),
      email: email || "researcher@lab.org",
      createdAt: new Date().toISOString()
    };
    window.localStorage.setItem("paperlab_user", JSON.stringify(profile));
    router.push("/dashboard");
  }

  function handleDemoLogin() {
    const demoProfile = {
      name: "Dr. Alex Vance",
      email: "alex.vance@stanford.edu",
      createdAt: new Date().toISOString()
    };
    window.localStorage.setItem("paperlab_user", JSON.stringify(demoProfile));
    router.push("/dashboard");
  }

  return (
    <main className="auth-page">
      <BackgroundAnimation />

      <nav className="site-nav compact">
        <Link className="brand-mark" href="/">
          <span className="brand-logo-icon">
            <Layers size={16} />
          </span>
          ARPA PaperLab
        </Link>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link className="nav-button" href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Sign Up" : "Log In"}
          </Link>
        </div>
      </nav>

      <section className="auth-shell">
        <div className="auth-panel">
          <div className="hero-pill" style={{ marginBottom: "16px" }}>
            <Sparkles size={13} />
            {mode === "login" ? "Researcher Access" : "Workspace Setup"}
          </div>

          <h1>{mode === "login" ? "Welcome back" : "Create workspace"}</h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Access your academic paper pipeline, datasets, and decision logs."
              : "Launch an autonomous paper drafting pipeline with human checkpoints."}
          </p>

          <form onSubmit={submit} className="auth-form">
            {mode === "signup" ? (
              <label>
                <span>Full Name / Title</span>
                <div className="input-wrap">
                  <UserRound size={16} />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Dr. Jane Doe"
                  />
                </div>
              </label>
            ) : null}

            <label>
              <span>Academic Email</span>
              <div className="input-wrap">
                <Mail size={16} />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="jane.doe@university.edu"
                />
              </div>
            </label>

            <label>
              <span>Password</span>
              <div className="input-wrap">
                <LockKeyhole size={16} />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </label>

            <button className="primary-action" type="submit" style={{ width: "100%", marginTop: "8px" }}>
              {mode === "login" ? "Log In to Workspace" : "Launch Workspace"}
              <ArrowRight size={15} />
            </button>
          </form>

          <button
            type="button"
            className="demo-login-btn"
            onClick={handleDemoLogin}
          >
            <Sparkles size={14} />
            Instant 1-Click Demo Login
          </button>

          <p className="auth-note">
            {mode === "login" ? "Don't have a workspace yet?" : "Already have a workspace?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"}>
              {mode === "login" ? "Sign up" : "Log in"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
