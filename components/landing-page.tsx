"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  GitBranch,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { BackgroundAnimation } from "@/components/background-animation";

export function LandingPage() {
  return (
    <main className="site-page">
      <BackgroundAnimation />

      {/* Navigation */}
      <nav className="site-nav">
        <Link className="brand-mark" href="/">
          <span className="brand-logo-icon">
            <Layers size={16} />
          </span>
          ARPA PaperLab
        </Link>
        <div className="nav-links">
          <a href="#pipeline-preview">Workflow</a>
          <a href="#features">Features</a>
          <a href="#outputs">Outputs</a>
          <Link href="/login">Log In</Link>
          <Link className="nav-button" href="/signup">
            Launch Workspace
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="hero-pill">
            <Sparkles size={13} />
            Autonomous Research Accelerator
          </div>

          <h1>
            Compile verified academic drafts <span className="gradient-text">with complete provenance.</span>
          </h1>

          <p>
            Upload source papers, approve hypotheses, generate reproducible statistical analyses, and export publication-ready manuscripts with human-in-the-loop gates.
          </p>

          <div className="hero-actions">
            <Link className="primary-action" href="/signup">
              <Play size={15} />
              Start Pipeline
            </Link>
            <Link className="secondary-action" href="/dashboard">
              Open Workspace
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* Live Interactive Pipeline Preview Visual */}
        <div className="interactive-preview-card" id="pipeline-preview">
          <div className="preview-header">
            <div className="window-dots">
              <span />
              <span />
              <span />
            </div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              pipeline-runtime.v1.0
            </span>
            <span className="badge badge-completed">
              <Check size={10} /> Active
            </span>
          </div>

          <div className="pipeline-stepper-preview">
            <div className="stepper-item-preview done">
              <CheckCircle2 size={15} />
              <span>1. Ingest Literature &amp; Synthesize Gap Map</span>
            </div>
            <div className="stepper-item-preview done">
              <CheckCircle2 size={15} />
              <span>2. Formulate Hypotheses &amp; Reviewer Critique</span>
            </div>
            <div className="stepper-item-preview active">
              <GitBranch size={15} />
              <span>3. Human Gate: Research Question Approval</span>
            </div>
            <div className="stepper-item-preview">
              <BarChart3 size={15} />
              <span>4. Statistical Tests &amp; SVG Visualizations</span>
            </div>
            <div className="stepper-item-preview">
              <FileCheck2 size={15} />
              <span>5. Assemble Paper Draft (.DOCX / .MD)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Band */}
      <section className="feature-band" id="features">
        <article className="feature-item">
          <div className="feature-icon-wrap">
            <FileText size={18} />
          </div>
          <h3>Literature Synthesis</h3>
          <p>Parses uploaded research PDFs to extract findings, methodologies, and a structured thematic gap map.</p>
        </article>

        <article className="feature-item">
          <div className="feature-icon-wrap">
            <GitBranch size={18} />
          </div>
          <h3>Human Checkpoints</h3>
          <p>Pauses execution for researcher validation on questions, study proposals, and reviewer revisions.</p>
        </article>

        <article className="feature-item">
          <div className="feature-icon-wrap">
            <BarChart3 size={18} />
          </div>
          <h3>Statistical Verification</h3>
          <p>Calculates correlation, effect sizes, and p-values, outputting publication-grade SVG figures.</p>
        </article>

        <article className="feature-item">
          <div className="feature-icon-wrap">
            <ShieldCheck size={18} />
          </div>
          <h3>Provenance &amp; Audit</h3>
          <p>Maintains immutable decision logs and number-trace audits tracking AI synthesis against source data.</p>
        </article>
      </section>

      {/* Outputs Band */}
      <section className="output-band" id="outputs">
        <div>
          <div className="hero-pill" style={{ marginBottom: "12px" }}>
            <Zap size={13} />
            Standardized Exports
          </div>
          <h2>Formatted manuscripts, raw datasets, and chart bundles.</h2>
        </div>
        <p>
          ARPA compiles formatted <strong>paper_draft.docx</strong> and <strong>paper_draft.md</strong> drafts alongside verified dataset CSVs, analysis tables, SVG figures, and full peer-review response logs.
        </p>
      </section>
    </main>
  );
}
