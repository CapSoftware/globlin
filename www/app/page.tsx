"use client";

import { useState, useEffect } from "react";

function BenchmarkBar({
  name,
  version,
  time,
  maxTime,
  isHighlight,
  delay = 0,
}: {
  name: string;
  version: string;
  time: number;
  maxTime: number;
  isHighlight?: boolean;
  delay?: number;
}) {
  const width = (time / maxTime) * 100;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 text-right">
        <div
          className={`text-sm font-medium ${isHighlight ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}
        >
          {name}
        </div>
        <div className="text-xs text-[var(--color-text-muted)] font-mono">
          {version}
        </div>
      </div>
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 h-7 bg-[var(--color-bg-elevated)] rounded-sm overflow-hidden">
          <div
            className={`h-full rounded-sm transition-transform duration-1000 ease-out ${
              isHighlight ? "benchmark-bar-inner" : "benchmark-bar-slow"
            }`}
            style={{
              width: `${width}%`,
              transform: animated ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: "left",
            }}
          />
        </div>
        <div className="w-20 text-right font-mono text-sm text-[var(--color-text-secondary)]">
          {time.toLocaleString()}ms
        </div>
      </div>
    </div>
  );
}

function InstallBox() {
  const [copied, setCopied] = useState(false);
  const command = "bun add globlin";

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden card-glow hover-lift">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="font-mono text-base">
          <span className="text-[var(--color-accent)]">$ </span>
          <span className="text-[var(--color-text)]">{command}</span>
          <span className="terminal-cursor" />
        </div>
        <button
          onClick={handleCopy}
          className="p-2 rounded-md hover:bg-[var(--color-bg-elevated)] transition-all duration-200 group"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <svg
              className="w-5 h-5 text-[var(--color-accent)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function SpeedLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="speed-line"
          style={{
            top: `${20 + i * 15}%`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen grid-bg relative">
      <div className="noise-overlay" />

      {/* Glow orbs */}
      <div
        className="glow-orb w-96 h-96 bg-[var(--color-accent)]"
        style={{ top: "-10%", right: "10%", opacity: 0.08 }}
      />
      <div
        className="glow-orb w-64 h-64 bg-[var(--color-accent)]"
        style={{ bottom: "20%", left: "-5%", opacity: 0.05, animationDelay: "2s" }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 py-5">
        <nav className="mx-auto max-w-6xl flex items-center justify-between">
          <a
            href="/"
            className="text-xl font-bold tracking-tight text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
          >
            globlin
          </a>
          <div className="flex items-center gap-8 text-sm">
            <a
              href="#benchmarks"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Benchmarks
            </a>
            <a
              href="https://github.com/CapSoftware/globlin"
              className="flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              GitHub
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 px-6 pt-20 pb-32">
        <div className="mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-20 items-start">
            {/* Left column */}
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs text-[var(--color-text-secondary)] mb-8">
                <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                v0.1.0 — Now Available
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-8">
                <span className="text-gradient">20-30x faster</span>
                <br />
                <span className="text-[var(--color-text)]">glob for Node.js</span>
              </h1>

              <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] mb-10 leading-relaxed max-w-lg">
                A drop-in replacement for{" "}
                <a
                  href="https://github.com/isaacs/node-glob"
                  className="text-[var(--color-text)] underline decoration-[var(--color-border-bright)] underline-offset-4 hover:decoration-[var(--color-accent)] transition-colors"
                >
                  glob
                </a>
                . Built in Rust with NAPI-RS bindings. Same API, same results,
                dramatically faster.
              </p>

              <div className="mb-10">
                <InstallBox />
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--color-text-muted)]">
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[var(--color-accent)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  100% API compatible
                </span>
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[var(--color-accent)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  TypeScript ready
                </span>
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[var(--color-accent)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Zero config
                </span>
              </div>
            </div>

            {/* Right column - Benchmarks */}
            <div
              id="benchmarks"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 card-glow relative overflow-hidden"
              style={{ animationDelay: "0.2s" }}
            >
              <SpeedLines />
              <div className="relative z-10">
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-2">
                    Pattern matching speed
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)] font-mono">
                    **/*.ts in a large project
                  </p>
                </div>

                <div className="space-y-5">
                  <BenchmarkBar
                    name="globlin"
                    version="v0.1.0"
                    time={12}
                    maxTime={320}
                    isHighlight
                    delay={400}
                  />
                  <BenchmarkBar
                    name="fast-glob"
                    version="v3.3.0"
                    time={89}
                    maxTime={320}
                    delay={600}
                  />
                  <BenchmarkBar
                    name="glob"
                    version="v10.3.0"
                    time={320}
                    maxTime={320}
                    delay={800}
                  />
                </div>

                <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
                  <a
                    href="https://github.com/CapSoftware/globlin#benchmarks"
                    className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    View all benchmarks
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Usage section */}
          <div className="mt-32 grid lg:grid-cols-2 gap-8">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 hover-lift">
              <h2 className="font-semibold text-lg mb-3">Drop-in replacement</h2>
              <p className="text-[var(--color-text-secondary)] mb-6">
                Just change your import. No other code changes needed.
              </p>
              <div className="rounded-lg bg-[var(--color-bg)] p-5 font-mono text-sm border border-[var(--color-border)]">
                <div className="text-[var(--color-text-muted)] mb-1">
                  {"// before"}
                </div>
                <div className="mb-4 text-[var(--color-text-secondary)]">
                  import {"{ glob }"} from{" "}
                  <span className="text-[#f472b6]">&apos;glob&apos;</span>;
                </div>
                <div className="text-[var(--color-accent)] mb-1">
                  {"// after"}
                </div>
                <div className="text-[var(--color-text)]">
                  import {"{ glob }"} from{" "}
                  <span className="text-[var(--color-accent)]">
                    &apos;globlin&apos;
                  </span>
                  ;
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 hover-lift">
              <h2 className="font-semibold text-lg mb-3">Full API support</h2>
              <p className="text-[var(--color-text-secondary)] mb-6">
                Async, sync, streams, and all glob v13 options.
              </p>
              <div className="rounded-lg bg-[var(--color-bg)] p-5 font-mono text-sm border border-[var(--color-border)]">
                <pre className="text-[var(--color-text)]">
                  <span className="text-[var(--color-text-muted)]">const</span>{" "}
                  files ={" "}
                  <span className="text-[var(--color-text-muted)]">await</span>{" "}
                  <span className="text-[var(--color-accent)]">glob</span>(
                  <span className="text-[#f472b6]">&apos;**/*.ts&apos;</span>);
                  {"\n"}
                  <span className="text-[var(--color-text-muted)]">const</span>{" "}
                  sync ={" "}
                  <span className="text-[var(--color-accent)]">glob</span>.sync(
                  <span className="text-[#f472b6]">&apos;*.js&apos;</span>);
                  {"\n"}
                  <span className="text-[var(--color-text-muted)]">const</span>{" "}
                  stream ={" "}
                  <span className="text-[var(--color-accent)]">glob</span>
                  .stream(
                  <span className="text-[#f472b6]">&apos;src/**/*&apos;</span>);
                </pre>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-24">
            <h2 className="font-semibold text-lg mb-8">Features</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                [
                  "Rust-powered",
                  "Native performance via NAPI-RS bindings",
                  "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
                ],
                [
                  "Cross-platform",
                  "macOS, Linux, Windows, and ARM64",
                  "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
                ],
                [
                  "Battle-tested",
                  "Differential testing with 90%+ code coverage",
                  "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                ],
              ].map(([title, desc, icon]) => (
                <div
                  key={title}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 hover-lift"
                >
                  <svg
                    className="w-6 h-6 text-[var(--color-accent)] mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                  <div className="font-medium mb-2">{title}</div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-10 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
              <span>Brought to you by the team behind</span>
              <a
                href="https://cap.so"
                className="inline-flex items-center gap-1.5 text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors font-medium"
              >
                Cap
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a
                href="https://github.com/CapSoftware/globlin"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://npmjs.com/package/globlin"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                npm
              </a>
              <span className="text-[var(--color-text-muted)]">MIT License</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
