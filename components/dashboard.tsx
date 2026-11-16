"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Gauge,
  GitBranch,
  Home,
  Info,
  Layers,
  Lightbulb,
  LogOut,
  Maximize2,
  MessageSquareText,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";

import { PipelineState, StageName } from "@/lib/types";
import { BackgroundAnimation } from "@/components/background-animation";

const STAGES: Array<{ key: StageName; label: string; description: string; short: string; isGate?: boolean }> = [
  { key: "ingest-literature", label: "Ingest Literature", short: "Literature", description: "Extract PDFs and synthesize thematic gap map.", isGate: true },
  { key: "generate-proposal", label: "Generate Proposal", short: "Proposal", description: "Draft hypotheses, contribution, and reviewer critique.", isGate: true },
  { key: "design-methodology", label: "Design Methodology", short: "Methodology", description: "Map hypotheses to statistical tests and variables." },
  { key: "generate-dataset", label: "Generate Dataset", short: "Dataset", description: "Synthesize or validate dataset schema." },
  { key: "run-analysis", label: "Run Analysis", short: "Analysis", description: "Compute correlation, regression, and effect sizes." },
  { key: "make-visualizations", label: "Make Visualizations", short: "Visuals", description: "Export SVG publication figures and Tableau CSV." },
  { key: "draft-results", label: "Draft Results", short: "Results", description: "Draft Results, Discussion, and number-trace check." },
  { key: "assemble-paper", label: "Assemble Paper", short: "Assembly", description: "Compile draft as Markdown and Word DOCX." },
  { key: "peer-review", label: "Peer Review", short: "Peer Review", description: "Resolve reviewer comments with human decisions.", isGate: true }
];

interface StatePayload {
  state: PipelineState;
  artifacts: {
    markdownArtifacts: Array<{ name: string; content: string }>;
    figures: string[];
  };
}

interface Profile {
  name: string;
  email: string;
}

export function Dashboard() {
  const router = useRouter();
  const [payload, setPayload] = useState<StatePayload | null>(null);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [customQuestion, setCustomQuestion] = useState<string>("");
  const [proposalApproved, setProposalApproved] = useState(true);
  const [peerResponse, setPeerResponse] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [revisionDescription, setRevisionDescription] = useState("");
  const [applyRevision, setApplyRevision] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // UI Tabs & Filters
  const [activeArtifactTab, setActiveArtifactTab] = useState<string>("all");
  const [artifactSearch, setArtifactSearch] = useState("");
  const [zoomedFigure, setZoomedFigure] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [copiedArtifact, setCopiedArtifact] = useState<string | null>(null);
  const [paperFiles, setPaperFiles] = useState<FileList | null>(null);
  const [commentFile, setCommentFile] = useState<File | null>(null);

  const completed = useMemo(() => new Set(payload?.state.completedStages ?? []), [payload?.state.completedStages]);

  async function refreshState(options: { announce?: boolean } = {}) {
    const { announce = false } = options;
    if (announce) {
      setIsRefreshing(true);
      setMessage("");
    }

    try {
      const response = await fetch(`/api/state?refresh=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}.`);
      }

      const next = (await response.json()) as StatePayload;
      setPayload(next);

      if (next.state.humanGate?.type === "select-question") {
        const candidates = (next.state.humanGate.payload.candidateQuestions as Array<{ question: string }> | undefined) ?? [];
        if (candidates.length > 0) {
          setSelectedQuestion((curr) => curr || candidates[0].question);
        }
      }

      if (next.state.humanGate?.type === "peer-review") {
        const suggestion = String(next.state.humanGate.payload.suggestion ?? "");
        const matchResp = suggestion.match(/Response:\s*([\s\S]*?)(?=Revision:|$)/i);
        const matchRev = suggestion.match(/Revision:\s*([\s\S]*)$/i);
        if (matchResp?.[1]) setPeerResponse(matchResp[1].trim());
        if (matchRev?.[1]) setRevisionText(matchRev[1].trim());
        setRevisionDescription("Addressed reviewer comments");
        setApplyRevision(true);
      }

      if (announce) {
        setMessage(`Workspace refreshed at ${new Date().toLocaleTimeString()}.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (announce) {
        setMessage(detail);
      }
    } finally {
      if (announce) {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const raw = window.localStorage.getItem("paperlab_user");
    if (raw) {
      try {
        setProfile(JSON.parse(raw) as Profile);
      } catch {}
    }
    refreshState();
  }, []);

  async function runStage(stage: StageName | "run-all", overwrite = true) {
    setBusyLabel(stage);
    setMessage("");
    try {
      const response = await fetch(`/api/stages/${stage}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overwrite,
          style: "apa",
          n: 500
        })
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(`Executed: ${stage === "run-all" ? "Pipeline batch" : stage}`);
      } else {
        setMessage(result.error ?? "Stage run failed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function uploadPapers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paperFiles || !paperFiles.length) return;
    const body = new FormData();
    Array.from(paperFiles).forEach((file) => body.append("papers", file));
    setBusyLabel("upload-papers");
    try {
      const response = await fetch("/api/uploads/papers", { method: "POST", body });
      const result = await response.json();
      setMessage(response.ok ? `Uploaded ${result.uploaded.length} source research PDF(s).` : result.error);
      setPaperFiles(null);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function uploadComments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentFile) return;
    const body = new FormData();
    body.append("comments", commentFile);
    setBusyLabel("upload-comments");
    try {
      const response = await fetch("/api/uploads/comments", { method: "POST", body });
      const result = await response.json();
      setMessage(response.ok ? `Uploaded comments: ${result.uploaded}.` : result.error);
      setCommentFile(null);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function resolveQuestion() {
    const gate = payload?.state.humanGate;
    if (!gate || gate.type !== "select-question") return;
    const candidates = (gate.payload.candidateQuestions as Array<{ label: string; question: string }> | undefined) ?? [];
    const candidate = candidates.find((item) => item.question === selectedQuestion);
    const question = customQuestion.trim() || selectedQuestion;
    if (!question) return;
    setBusyLabel("select-question");
    try {
      const response = await fetch("/api/gates/select-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectionType: customQuestion.trim() ? "custom" : "candidate",
          label: customQuestion.trim() ? "Custom" : candidate?.label ?? "RQ",
          question
        })
      });
      const result = await response.json();
      setMessage(response.ok ? "Research question approved." : result.error);
      setCustomQuestion("");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function resolveProposal() {
    setBusyLabel("approve-proposal");
    try {
      const response = await fetch("/api/gates/approve-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: proposalApproved })
      });
      const result = await response.json();
      setMessage(response.ok ? (result.approved ? "Proposal approved. Ready for methodology." : "Proposal returned for revision.") : result.error);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function resolvePeerReview() {
    setBusyLabel("resolve-peer");
    try {
      const response = await fetch("/api/gates/resolve-peer-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: peerResponse,
          applyRevision,
          revisionDescription,
          revisionText
        })
      });
      const result = await response.json();
      setMessage(response.ok ? (result.completed ? "Peer review complete! Final paper compiled." : "Peer review comment recorded.") : result.error);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function resetWorkspace() {
    setBusyLabel("reset");
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const result = await res.json();
      setMessage(res.ok ? "Workspace reset to initial state." : result.error);
      setShowResetModal(false);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusyLabel("");
      await refreshState();
    }
  }

  async function handleDownload(fileType: string, filename: string) {
    setDownloadingFile(fileType);
    try {
      const res = await fetch(`/api/download?file=${fileType}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setMessage(`Downloaded ${filename} successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setDownloadingFile(null);
    }
  }

  function copyText(name: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedArtifact(name);
    setTimeout(() => setCopiedArtifact(null), 2000);
  }

  function signOut() {
    window.localStorage.removeItem("paperlab_user");
    router.push("/");
  }

  const state = payload?.state;
  const gate = state?.humanGate;
  const status = state?.status ?? "idle";
  const currentIndex = Number(gate?.payload.currentIndex ?? 0);
  const currentComment =
    gate?.type === "peer-review"
      ? ((gate.payload.comments as Array<{ comment: string; section: string }> | undefined) ?? [])[currentIndex]
      : undefined;

  const totalComments =
    gate?.type === "peer-review"
      ? ((gate.payload.comments as Array<unknown> | undefined) ?? []).length
      : 0;

  // Filter markdown artifacts
  const filteredArtifacts = useMemo(() => {
    const list = payload?.artifacts.markdownArtifacts ?? [];
    return list.filter((art) => {
      const matchSearch = art.name.toLowerCase().includes(artifactSearch.toLowerCase()) || art.content.toLowerCase().includes(artifactSearch.toLowerCase());
      if (!matchSearch) return false;
      if (activeArtifactTab === "all") return true;
      if (activeArtifactTab === "lit" && (art.name.includes("gap_map") || art.name.includes("lit"))) return true;
      if (activeArtifactTab === "proposal" && art.name.includes("proposal")) return true;
      if (activeArtifactTab === "method" && (art.name.includes("methodology") || art.name.includes("data_quality"))) return true;
      if (activeArtifactTab === "analysis" && (art.name.includes("summary_table") || art.name.includes("analysis") || art.name.includes("results_discussion"))) return true;
      if (activeArtifactTab === "draft" && art.name.includes("paper_draft")) return true;
      if (activeArtifactTab === "logs" && (art.name.includes("decision_log") || art.name.includes("peer_review_log") || art.name.includes("word_count"))) return true;
      return false;
    });
  }, [payload?.artifacts.markdownArtifacts, activeArtifactTab, artifactSearch]);

  const completionPercentage = Math.round((completed.size / 9) * 100);

  return (
    <main className="app-shell">
      <BackgroundAnimation />

      <section className="workspace">
        {/* Header Bar */}
        <header className="workspace-header" id="overview">
          <div className="workspace-title-area">
            <h1>
              Research Pipeline
              <span className={`badge badge-${status === "awaiting_human_gate" ? "gate" : status === "running" ? "running" : status === "completed" ? "completed" : "idle"}`}>
                <span className="status-dot" />
                {status === "awaiting_human_gate" ? "Gate Paused" : status === "running" ? `Running: ${busyLabel}` : status === "completed" ? "Completed" : "Ready"}
              </span>
            </h1>
          </div>

          <div className="header-actions">
            <button
              className="quiet-button"
              onClick={() => refreshState({ announce: true })}
              disabled={Boolean(busyLabel) || isRefreshing}
            >
              <RefreshCw className={isRefreshing ? "spin" : ""} size={14} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>

            <button
              className="quiet-button"
              onClick={() => setShowResetModal(true)}
              disabled={Boolean(busyLabel)}
              title="Reset workspace"
            >
              <RotateCcw size={14} />
              Reset
            </button>

            <button
              className="primary-action"
              disabled={Boolean(busyLabel)}
              onClick={() => runStage("run-all", false)}
            >
              <Play size={14} />
              {busyLabel === "run-all" ? "Running..." : "Run Until Next Gate"}
            </button>
          </div>
        </header>

        {/* Global Toast Alert */}
        {message ? (
          <div className="app-alert">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Info size={16} />
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage("")} style={{ color: "var(--text-muted)", cursor: "pointer" }}>
              <X size={14} />
            </button>
          </div>
        ) : null}

        {/* Compact pipeline status */}
        <section className="pipeline-progress-section" id="pipeline">
          <div className="stepper-header">
            <h3>Pipeline Stages</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400 }}>
              {completionPercentage}% Complete
            </span>
          </div>

          <div className="stepper-progress-track">
            <div className="stepper-progress-fill" style={{ width: `${completionPercentage}%` }} />
          </div>

          <div className="stepper-grid">
            {STAGES.map((s, idx) => {
              const isDone = completed.has(s.key);
              const isRunning = busyLabel === s.key;
              const isGated = gate?.type && STAGES.find((st) => st.key === s.key)?.isGate && state?.currentStage === s.key;

              return (
                <button
                  key={s.key}
                  className={`stage-step-pill ${isDone ? "completed" : ""} ${isRunning ? "running" : ""} ${isGated ? "gated" : ""}`}
                  onClick={() => runStage(s.key)}
                  disabled={Boolean(busyLabel)}
                  title={s.description}
                >
                  <span className="step-num">{isDone ? <Check size={11} /> : idx + 1}</span>
                  <span>{s.short}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Main 2-Column Dashboard Grid */}
        <section className="dashboard-grid">
          {/* Left Column: Stage Runner & Inputs */}
          <div className="stack">
            {/* Input & Uploads */}
            <section className="workspace-panel">
              <div className="panel-heading">
                <div>
                  <h2>Source paper</h2>
                  <p>Upload a PDF, then run the guided demo.</p>
                </div>
                <FolderUp size={18} />
              </div>

              <div className="upload-grid single-upload">
                <form onSubmit={uploadPapers} className="dropzone">
                  <UploadCloud size={20} />
                  <div>
                    <strong style={{ display: "block", fontSize: "0.86rem", fontWeight: 500 }}>Research PDFs</strong>
                    <small style={{ color: "var(--text-muted)" }}>
                      {paperFiles?.length ? `${paperFiles.length} file(s) selected` : "Select source .pdf papers"}
                    </small>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => setPaperFiles(e.target.files)}
                    style={{ fontSize: "0.78rem", width: "100%" }}
                  />
                  <button
                    type="submit"
                    className="secondary-action"
                    disabled={!paperFiles?.length || busyLabel === "upload-papers"}
                    style={{ width: "100%" }}
                  >
                    {busyLabel === "upload-papers" ? "Uploading..." : "Upload PDFs"}
                  </button>
                </form>
              </div>
            </section>

          </div>

          {/* Right Column: Active Human Gate & Artifacts & Figures & Exports */}
          <div className="stack">
            {/* Active Human Gate Panel */}
            {gate ? (
              <section className="workspace-panel gate-panel">
                <div className="panel-heading">
                  <div>
                    <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Lightbulb size={18} />
                      Human Review Checkpoint
                    </h2>
                    <p>Pipeline paused awaiting your validation.</p>
                  </div>
                  <GitBranch size={18} />
                </div>

                {/* Gate 1: Select Question */}
                {gate.type === "select-question" ? (
                  <div className="gate-content">
                    <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                      Select a research hypothesis candidate or provide a customized question:
                    </p>

                    {((gate.payload.candidateQuestions as Array<{ label: string; question: string; feasibilityNote: string; sourcePapers: string[] }>) ?? []).map(
                      (item) => (
                        <button
                          type="button"
                          key={item.label}
                          className={`question-option ${selectedQuestion === item.question ? "active" : ""}`}
                          onClick={() => {
                            setSelectedQuestion(item.question);
                            setCustomQuestion("");
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>{item.label}</strong>
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", padding: "1px 6px", borderRadius: "4px" }}>
                              {item.sourcePapers?.length ?? 0} source paper(s)
                            </span>
                          </div>
                          <span>{item.question}</span>
                          <small>{item.feasibilityNote}</small>
                        </button>
                      )
                    )}

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "6px" }}>
                        Custom research question:
                      </label>
                      <input
                        className="field"
                        placeholder="Enter custom research question..."
                        value={customQuestion}
                        onChange={(event) => setCustomQuestion(event.target.value)}
                      />
                    </div>

                    <button
                      className="primary-action"
                      disabled={busyLabel === "select-question"}
                      onClick={resolveQuestion}
                    >
                      <Check size={14} />
                      {busyLabel === "select-question" ? "Saving..." : "Approve Research Question"}
                    </button>
                  </div>
                ) : null}

                {/* Gate 2: Approve Proposal */}
                {gate.type === "approve-proposal" ? (
                  <div className="gate-content">
                    {gate.payload.proposal ? (
                      <div className="proposal-preview-box">
                        <strong style={{ display: "block", marginBottom: "6px" }}>Proposal Summary:</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                          {String(gate.payload.proposal)}
                        </pre>
                      </div>
                    ) : null}

                    {gate.payload.critique ? (
                      <div className="critique-box">
                        <strong style={{ display: "block", marginBottom: "4px" }}>Reviewer Critique:</strong>
                        <p style={{ margin: 0 }}>{String(gate.payload.critique)}</p>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="proposalChoice"
                          checked={proposalApproved}
                          onChange={() => setProposalApproved(true)}
                        />
                        <span style={{ fontWeight: 400 }}>Approve proposal &amp; proceed</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="proposalChoice"
                          checked={!proposalApproved}
                          onChange={() => setProposalApproved(false)}
                        />
                        <span style={{ color: "var(--text-muted)" }}>Return for revision</span>
                      </label>
                    </div>

                    <button
                      className="primary-action"
                      disabled={busyLabel === "approve-proposal"}
                      onClick={resolveProposal}
                    >
                      <Check size={14} />
                      {busyLabel === "approve-proposal" ? "Submitting..." : "Submit Decision"}
                    </button>
                  </div>
                ) : null}

                {/* Gate 3: Peer Review Resolution */}
                {gate.type === "peer-review" ? (
                  <div className="gate-content">
                    <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <strong>
                          Comment {currentIndex + 1} of {totalComments}
                        </strong>
                        <span className="badge badge-idle">{currentComment?.section || "General"}</span>
                      </div>
                      <p style={{ fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-main)" }}>
                        &ldquo;{currentComment?.comment ?? "No comment text."}&rdquo;
                      </p>
                    </div>

                    {gate.payload.suggestion ? (
                      <div className="suggestion-box">
                        <strong style={{ display: "block", marginBottom: "4px" }}>
                          <Sparkles size={13} style={{ display: "inline", marginRight: "4px" }} />
                          Suggested Response &amp; Revision:
                        </strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-sans)", fontSize: "0.82rem", margin: 0 }}>
                          {String(gate.payload.suggestion)}
                        </pre>
                      </div>
                    ) : null}

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Author Response:
                      </label>
                      <textarea
                        className="textarea"
                        placeholder="Log human author response..."
                        value={peerResponse}
                        onChange={(e) => setPeerResponse(e.target.value)}
                        style={{ minHeight: "75px" }}
                      />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={applyRevision}
                        onChange={(e) => setApplyRevision(e.target.checked)}
                      />
                      <span>Apply revision to manuscript draft</span>
                    </label>

                    {applyRevision ? (
                      <>
                        <input
                          className="field"
                          placeholder="Revision note (e.g. Added limitations paragraph)"
                          value={revisionDescription}
                          onChange={(e) => setRevisionDescription(e.target.value)}
                        />
                        <textarea
                          className="textarea"
                          placeholder="Approved revision text to insert..."
                          value={revisionText}
                          onChange={(e) => setRevisionText(e.target.value)}
                          style={{ minHeight: "85px" }}
                        />
                      </>
                    ) : null}

                    <button
                      className="primary-action"
                      disabled={busyLabel === "resolve-peer"}
                      onClick={resolvePeerReview}
                    >
                      <Check size={14} />
                      {busyLabel === "resolve-peer" ? "Recording..." : `Record Decision (${currentIndex + 1}/${totalComments})`}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="workspace-panel gate-panel empty">
                <ShieldCheck size={24} color="var(--text-dim)" />
                <h3 style={{ marginTop: "6px", fontSize: "0.92rem", fontWeight: 500 }}>No Gate Checkpoint Pending</h3>
                <p>Pipeline continues automatically until reaching a decision gate.</p>
              </section>
            )}

            {/* Export & Download Bundle */}
            <section className="workspace-panel" id="exports">
              <div className="panel-heading">
                <div>
                  <h2>Export &amp; Download Bundle</h2>
                  <p>Download compiled manuscript drafts, datasets, and provenance logs.</p>
                </div>
                <Download size={18} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("docx", "paper_draft.docx")}
                  disabled={downloadingFile === "docx"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <FileDown size={16} />
                  <span>{downloadingFile === "docx" ? "Preparing..." : "Download .DOCX"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("md", "paper_draft.md")}
                  disabled={downloadingFile === "md"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <FileText size={16} />
                  <span>{downloadingFile === "md" ? "Preparing..." : "Download .MD Draft"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("dataset", "dataset.csv")}
                  disabled={downloadingFile === "dataset"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <FileSpreadsheet size={16} />
                  <span>{downloadingFile === "dataset" ? "Preparing..." : "Download Dataset .CSV"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("decision-log", "decision_log.md")}
                  disabled={downloadingFile === "decision-log"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <ShieldCheck size={16} />
                  <span>{downloadingFile === "decision-log" ? "Preparing..." : "Decision Log .MD"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("tableau", "tableau_export.csv")}
                  disabled={downloadingFile === "tableau"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <BarChart3 size={16} />
                  <span>{downloadingFile === "tableau" ? "Preparing..." : "Tableau Export .CSV"}</span>
                </button>

                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleDownload("peer-review", "peer_review_log.md")}
                  disabled={downloadingFile === "peer-review"}
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <FileArchive size={16} />
                  <span>{downloadingFile === "peer-review" ? "Preparing..." : "Peer Review Log .MD"}</span>
                </button>
              </div>
            </section>

            {/* Figures & Visualizations Gallery */}
            <section className="workspace-panel" id="figures">
              <div className="panel-heading">
                <div>
                  <h2>Figures &amp; Visualizations</h2>
                  <p>Generated SVG figures and visual distribution assets.</p>
                </div>
                <BarChart3 size={18} />
              </div>

              {payload?.artifacts.figures.length ? (
                <div className="figure-gallery-grid">
                  {payload.artifacts.figures.map((figure) => {
                    const isSvg = figure.endsWith(".svg");
                    const title = figure.replace(/_/g, " ").replace(/\.(svg|csv)$/, "");

                    return (
                      <div key={figure} className="figure-card">
                        {isSvg ? (
                          <div className="figure-preview-wrap" onClick={() => setZoomedFigure(figure)} title="Click to zoom">
                            <img src={`/api/figures/${encodeURIComponent(figure)}`} alt={title} />
                          </div>
                        ) : (
                          <div className="figure-preview-wrap" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <FileSpreadsheet size={28} />
                            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>Tableau CSV</span>
                          </div>
                        )}

                        <div className="figure-card-footer">
                          <span className="figure-title" title={figure}>{title}</span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {isSvg ? (
                              <button className="icon-button" onClick={() => setZoomedFigure(figure)} title="Zoom preview" style={{ width: "26px", height: "26px" }}>
                                <Maximize2 size={12} />
                              </button>
                            ) : null}
                            <a
                              className="icon-button"
                              href={`/api/figures/${encodeURIComponent(figure)}`}
                              download={figure}
                              title="Download asset"
                              style={{ width: "26px", height: "26px" }}
                            >
                              <Download size={12} />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "var(--text-dim)", fontSize: "0.84rem" }}>No figures generated yet. Run Stage 6 (Make Visualizations) to generate charts.</p>
              )}
            </section>

            {/* Generated Artifacts Inspector */}
            <section className="workspace-panel" id="artifacts">
              <div className="panel-heading">
                <div>
                  <h2>Artifacts &amp; Reports</h2>
                  <p>Inspect intermediate drafts and audit traces.</p>
                </div>
              </div>

              {/* Filter Tabs & Search */}
              <div className="artifact-filter-bar">
                {[
                  { id: "all", label: "All" },
                  { id: "lit", label: "Literature" },
                  { id: "proposal", label: "Proposal" },
                  { id: "method", label: "Methodology" },
                  { id: "analysis", label: "Analysis" },
                  { id: "draft", label: "Paper Draft" },
                  { id: "logs", label: "Decision & Logs" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`filter-tab ${activeArtifactTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveArtifactTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--text-dim)" }} />
                <input
                  className="field"
                  placeholder="Search artifacts..."
                  value={artifactSearch}
                  onChange={(e) => setArtifactSearch(e.target.value)}
                  style={{ paddingLeft: "32px" }}
                />
              </div>

              {/* Artifact Accordion List */}
              <div className="artifact-list">
                {filteredArtifacts.length ? (
                  filteredArtifacts.map((artifact) => (
                    <details key={artifact.name} className="artifact-card">
                      <summary>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <FileText size={14} />
                          <span>{artifact.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-button"
                            onClick={() => copyText(artifact.name, artifact.content)}
                            title="Copy markdown"
                            style={{ width: "24px", height: "24px" }}
                          >
                            {copiedArtifact === artifact.name ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </summary>
                      <div className="artifact-body">
                        <pre>{artifact.content}</pre>
                      </div>
                    </details>
                  ))
                ) : (
                  <p style={{ color: "var(--text-dim)", fontSize: "0.84rem" }}>No matching artifacts found.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </section>

      {/* Figure Zoom Modal */}
      {zoomedFigure ? (
        <div className="modal-overlay" onClick={() => setZoomedFigure(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: "1rem", fontWeight: 500 }}>{zoomedFigure}</h3>
              <div style={{ display: "flex", gap: "6px" }}>
                <a className="secondary-action" href={`/api/figures/${encodeURIComponent(zoomedFigure)}`} download={zoomedFigure}>
                  <Download size={14} />
                  Download
                </a>
                <button className="icon-button" onClick={() => setZoomedFigure(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="modal-body" style={{ background: "#000000", display: "grid", placeItems: "center" }}>
              <img
                src={`/api/figures/${encodeURIComponent(zoomedFigure)}`}
                alt={zoomedFigure}
                style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Reset Confirmation Modal */}
      {showResetModal ? (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-card" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.98rem", fontWeight: 500 }}>
                <RotateCcw size={16} />
                Reset Workspace?
              </h3>
              <button className="icon-button" onClick={() => setShowResetModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", lineHeight: 1.6 }}>
                This will reset the pipeline state to idle and clear generated outputs. Uploaded source papers and comments will be preserved.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <button className="quiet-button" onClick={() => setShowResetModal(false)}>
                  Cancel
                </button>
                <button
                  className="primary-action"
                  onClick={resetWorkspace}
                  disabled={busyLabel === "reset"}
                  style={{ background: "#ffffff", color: "#000000" }}
                >
                  {busyLabel === "reset" ? "Resetting..." : "Confirm Reset"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
