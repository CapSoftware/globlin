"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

// ── Intersection Observer hook ──

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}

function AnimateIn({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ── Components ──

function PerfBar({
  label,
  value,
  maxValue,
  isAccent,
  delay = 0,
}: {
  label: string;
  value: string;
  maxValue: number;
  isAccent?: boolean;
  delay?: number;
}) {
  const { ref, inView } = useInView(0.3);
  const width = (parseFloat(value) / maxValue) * 100;

  return (
    <div ref={ref} className="flex items-center gap-4">
      <div className="w-20 text-right shrink-0">
        <span className={`text-sm font-medium ${isAccent ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>
          {label}
        </span>
      </div>
      <div className="flex-1 perf-bar-track">
        <div
          className={`perf-bar-fill ${isAccent ? "perf-bar-fill-accent" : "perf-bar-fill-muted"}`}
          style={{
            width: `${width}%`,
            transform: inView ? "scaleX(1)" : "scaleX(0)",
            transitionDelay: `${delay}s`,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function InstallBox() {
  const [copied, setCopied] = useState(false);
  const command = "bun install globlin";

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block hover-lift">
      <div className="code-block-header">
        <div className="code-block-dot" />
        <div className="code-block-dot" />
        <div className="code-block-dot" />
      </div>
      <div className="flex items-center justify-between px-6 py-4">
        <div className="font-mono text-[15px]">
          <span className="text-[var(--color-text-muted)]">❯ </span>
          <span className="text-[var(--color-text)]">{command}</span>
          <span className="terminal-cursor" />
        </div>
        <button
          onClick={handleCopy}
          className="p-2 rounded-md hover:bg-white/5 transition-all duration-200 group"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function CountUp({ target, suffix = "", duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const { ref, inView } = useInView();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start * 10) / 10);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
}

function FileTree() {
  const { ref, inView } = useInView();
  const files = [
    { name: "src/", indent: 0, delay: 0, isDir: true },
    { name: "components/", indent: 1, delay: 0.06, isDir: true },
    { name: "Button.tsx", indent: 2, delay: 0.12, match: true },
    { name: "Modal.tsx", indent: 2, delay: 0.18, match: true },
    { name: "utils/", indent: 1, delay: 0.24, isDir: true },
    { name: "helpers.ts", indent: 2, delay: 0.3, match: true },
    { name: "index.ts", indent: 1, delay: 0.36, match: true },
    { name: "tests/", indent: 0, delay: 0.42, isDir: true },
    { name: "app.test.ts", indent: 1, delay: 0.48, match: true },
  ];

  return (
    <div ref={ref} className="font-mono text-xs leading-loose">
      {files.map((f, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 ${f.match ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}
          style={{
            paddingLeft: `${f.indent * 16}px`,
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-10px)",
            transition: `all 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${f.delay}s`,
          }}
        >
          {f.isDir ? (
            <svg className="w-3.5 h-3.5 shrink-0 text-[var(--color-orange)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          <span>{f.name}</span>
          {f.match && (
            <span className="ml-auto text-[10px] opacity-60">matched</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PlatformGrid() {
  const { ref, inView } = useInView();
  const platforms = [
    { name: "macOS", arch: "x64 + ARM64", icon: "apple" },
    { name: "Linux", arch: "x64 + ARM64", icon: "linux" },
    { name: "Windows", arch: "x64 + ARM64", icon: "windows" },
  ];

  return (
    <div ref={ref} className="grid grid-cols-3 gap-3">
      {platforms.map((p, i) => (
        <div
          key={p.name}
          className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-all duration-300 hover:border-[var(--color-border-bright)]"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "scale(1)" : "scale(0.85)",
            transition: `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
          }}
        >
          {p.icon === "apple" && (
            <svg className="w-7 h-7 text-[var(--color-text)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
          )}
          {p.icon === "linux" && (
            <svg className="w-7 h-7 text-[var(--color-text)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.368.39 0 .739-.134 1.107-.399.346-.24.652-.544.963-.868.35-.381.641-.47.967-.542.34-.075.654-.074.986-.321.332-.247.6-.544.838-.928.128-.2.234-.4.343-.595.312-.545.389-.85.712-1.47.133-.25.228-.393.456-.656.22-.26.406-.47.547-.73.24-.51.377-.92.377-1.455 0-.66-.268-1.11-.65-1.415a3.078 3.078 0 00-.378-.238 4.26 4.26 0 01-.297-.156c-.238-.145-.476-.385-.556-.725-.226-1.108-.33-2.13-1.089-3.085-.72-.905-1.247-1.67-1.362-2.777-.115-1.116-.14-3.202-1.321-4.46C15.24.725 13.896.012 12.504 0z" />
            </svg>
          )}
          {p.icon === "windows" && (
            <svg className="w-7 h-7 text-[var(--color-text)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
          )}
          <div className="text-xs font-semibold text-[var(--color-text)]">{p.name}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">{p.arch}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main ──

export default function Home() {
  return (
    <div className="min-h-screen grid-bg relative">
      <div className="noise-overlay" />

      {/* Glow orbs */}
      <div className="glow-orb w-[500px] h-[500px] bg-[var(--color-accent)]" style={{ top: "-15%", right: "5%", opacity: 0.06 }} />
      <div className="glow-orb w-[300px] h-[300px] bg-[var(--color-pink)]" style={{ top: "30%", left: "-8%", opacity: 0.04, animationDelay: "2s" }} />
      <div className="glow-orb w-[400px] h-[400px] bg-[var(--color-purple)]" style={{ top: "60%", right: "-5%", opacity: 0.03, animationDelay: "4s" }} />

      {/* Header */}
      <header className="relative z-10 px-6 py-5">
        <nav className="mx-auto max-w-[1200px] flex items-center justify-between">
          <a href="/" className="hover:opacity-80 transition-opacity">
            <img src="/globlin-logo.svg" alt="globlin" className="h-10" />
          </a>
          <div className="flex items-center gap-8 text-sm">
            <a href="#features" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
              Features
            </a>
            <a href="#benchmarks" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors">
              Benchmarks
            </a>
            <a
              href="https://github.com/CapSoftware/globlin"
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        {/* ── Hero ── */}
        <section className="px-6 pt-24 pb-40">
          <div className="mx-auto max-w-[1200px]">
            <div className="max-w-3xl mx-auto text-center animate-slide-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] text-xs text-[var(--color-text-secondary)] mb-10">
                <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                v1.0.0-beta.1
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-[80px] font-bold tracking-tight leading-[1.05] mb-8">
                <span className="text-gradient">~2x faster</span>{" "}
                <span className="text-[var(--color-text)]">glob</span>
                <br />
                <span className="text-[var(--color-text)]">for Node.js</span>
              </h1>

              <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] mb-12 leading-relaxed max-w-xl mx-auto">
                Drop-in replacement for{" "}
                <a
                  href="https://github.com/isaacs/node-glob"
                  className="text-[var(--color-text)] underline decoration-[var(--color-border-bright)] underline-offset-4 hover:decoration-[var(--color-accent)] transition-colors"
                >
                  glob
                </a>{" "}
                v13. Built in Rust. Same API, same results, way faster.
              </p>

              <div className="max-w-md mx-auto mb-12">
                <InstallBox />
              </div>

              <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-[var(--color-text-muted)]">
                {["100% API compatible", "TypeScript ready", "Zero config", "Cross-platform"].map(
                  (label) => (
                    <span key={label} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[var(--color-accent)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {label}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Performance Section (Bun-style horizontal bars) ── */}
        <section id="benchmarks" className="px-6 py-32 section-gradient">
          <div className="mx-auto max-w-[1200px]">
            <AnimateIn>
              <div className="max-w-2xl mx-auto text-center mb-20">
                <h2 className="text-3xl sm:text-5xl font-bold mb-5 tracking-tight">
                  Performance at <span className="text-gradient">every scale</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] text-lg">
                  Benchmarked on Apple M1 Pro. Results may vary by hardware, but the
                  ratios stay consistent.
                </p>
              </div>
            </AnimateIn>

            {/* Benchmark groups */}
            <div className="grid lg:grid-cols-2 gap-8 mb-12">
              <AnimateIn delay={0.05}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">Large directory</h3>
                    <span className="tag tag-green">100,000 files</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-8 font-mono">**/*.ts</p>
                  <div className="space-y-4">
                    <PerfBar label="globlin" value="77ms" maxValue={179} isAccent delay={0.1} />
                    <PerfBar label="fast-glob" value="82ms" maxValue={179} delay={0.2} />
                    <PerfBar label="glob" value="179ms" maxValue={179} delay={0.3} />
                  </div>
                </div>
              </AnimateIn>

              <AnimateIn delay={0.1}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">Static pattern</h3>
                    <span className="tag tag-orange">package.json</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-8 font-mono">No traversal needed</p>
                  <div className="space-y-4">
                    <PerfBar label="globlin" value="0.01ms" maxValue={0.05} isAccent delay={0.1} />
                    <PerfBar label="fast-glob" value="0.02ms" maxValue={0.05} delay={0.2} />
                    <PerfBar label="glob" value="0.05ms" maxValue={0.05} delay={0.3} />
                  </div>
                </div>
              </AnimateIn>
            </div>

            {/* Summary stats */}
            <AnimateIn delay={0.15}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "vs glob (avg)", value: 2.8, suffix: "x", color: "text-[var(--color-accent)]" },
                  { label: "vs fast-glob (avg)", value: 1.3, suffix: "x", color: "text-[var(--color-text)]" },
                  { label: "Static patterns", value: 7.5, suffix: "x", color: "text-[var(--color-orange)]" },
                  { label: "Simple globs", value: 2.8, suffix: "x", color: "text-[var(--color-pink)]" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-center hover-lift"
                  >
                    <div className={`text-3xl sm:text-4xl font-bold font-mono mb-2 ${stat.color}`}>
                      <CountUp target={stat.value} suffix={stat.suffix} />
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </AnimateIn>

            <AnimateIn delay={0.2}>
              <div className="mt-8 text-center">
                <a
                  href="https://github.com/CapSoftware/globlin#benchmarks"
                  className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                >
                  View full benchmark results on GitHub
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </a>
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* ── Bento Feature Grid ── */}
        <section id="features" className="px-6 py-32 section-gradient">
          <div className="mx-auto max-w-[1200px]">
            <AnimateIn>
              <div className="max-w-2xl mx-auto text-center mb-20">
                <h2 className="text-3xl sm:text-5xl font-bold mb-5 tracking-tight">
                  Same API, <span className="text-gradient-warm">way faster</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] text-lg">
                  Full compatibility with glob v13. All the speed of Rust.
                  No configuration required.
                </p>
              </div>
            </AnimateIn>

            <div className="bento-grid">
              {/* Card 1: Rust-powered (wide) */}
              <AnimateIn className="bento-card bento-card-wide" delay={0}>
                <div className="bento-card-inner p-8 sm:p-10 flex flex-col justify-between h-full">
                  <div className="absolute -right-12 -top-12 w-64 h-64 bg-[var(--color-accent)] opacity-[0.03] rounded-full blur-[80px]" />
                  <div className="relative z-10">
                    <span className="tag tag-green mb-6">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                      Performance
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-3">Built in Rust</h3>
                    <p className="text-[var(--color-text-secondary)] mb-8 max-w-lg leading-relaxed">
                      Native performance via NAPI-RS bindings. Optimized I/O with
                      depth-limited walking, prefix-based traversal, and compiled patterns.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 relative z-10">
                    {[
                      { value: 2.8, suffix: "x", label: "faster than glob" },
                      { value: 7.5, suffix: "x", label: "static patterns" },
                      { value: 90, suffix: "%+", label: "code coverage" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-5 text-center">
                        <div className="text-2xl sm:text-3xl font-bold text-[var(--color-accent)] font-mono">
                          <CountUp target={s.value} suffix={s.suffix} />
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-1.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </AnimateIn>

              {/* Card 2: Drop-in replacement */}
              <AnimateIn className="bento-card" delay={0.08}>
                <div className="bento-card-inner p-8 h-full flex flex-col">
                  <span className="tag tag-pink mb-6 w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    Migration
                  </span>
                  <h3 className="text-xl font-bold mb-2">Drop-in replacement</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    One line change. That&apos;s it.
                  </p>
                  <div className="code-block flex-1 flex flex-col">
                    <div className="code-block-header">
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                    </div>
                    <div className="code-block-body flex-1 flex flex-col justify-center">
                      <div className="flex items-start gap-3 mb-3 opacity-50">
                        <span className="text-[#ef4444] font-bold text-xs leading-6">-</span>
                        <span className="line-through decoration-[var(--color-text-muted)]/40">
                          import {"{ glob }"} from <span className="text-[var(--color-pink)]">&apos;glob&apos;</span>
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-[var(--color-accent)] font-bold text-xs leading-6">+</span>
                        <span className="text-[var(--color-text)]">
                          import {"{ glob }"} from <span className="text-[var(--color-accent)]">&apos;globlin&apos;</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </AnimateIn>

              {/* Row 2: Three single cards */}
              {/* Card 3: Cross-platform */}
              <AnimateIn className="bento-card" delay={0.1}>
                <div className="bento-card-inner p-8 h-full flex flex-col">
                  <span className="tag tag-blue mb-6 w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Platform
                  </span>
                  <h3 className="text-xl font-bold mb-2">Cross-platform</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    Native binaries for every major OS and architecture.
                  </p>
                  <div className="flex-1 flex items-end">
                    <PlatformGrid />
                  </div>
                </div>
              </AnimateIn>

              {/* Card 4: Pattern support */}
              <AnimateIn className="bento-card" delay={0.14}>
                <div className="bento-card-inner p-8 h-full flex flex-col">
                  <span className="tag tag-purple mb-6 w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    Patterns
                  </span>
                  <h3 className="text-xl font-bold mb-2">Full pattern support</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    Every glob pattern works out of the box.
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs flex-1">
                    {[
                      ["**/*.ts", "Recursive"],
                      ["{a,b}.js", "Braces"],
                      ["*.{js,ts}", "Extensions"],
                      ["[a-z]*", "Ranges"],
                      ["!(test)*", "Negation"],
                      ["?(opt).js", "Optional"],
                    ].map(([pattern, label]) => (
                      <div key={pattern} className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50">
                        <span className="text-[var(--color-accent)]">{pattern}</span>
                        <span className="text-[var(--color-text-muted)] text-[10px] ml-auto">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </AnimateIn>

              {/* Card 5: TypeScript (moved here to complete row 2) */}
              <AnimateIn className="bento-card" delay={0.18}>
                <div className="bento-card-inner p-8 h-full flex flex-col">
                  <span className="tag tag-blue mb-6 w-fit">
                    <span className="font-bold text-[10px]">TS</span>
                    TypeScript
                  </span>
                  <h3 className="text-xl font-bold mb-2">TypeScript first</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    Complete type definitions. Full IntelliSense support.
                  </p>
                  <div className="code-block flex-1">
                    <div className="code-block-header">
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                    </div>
                    <div className="code-block-body text-xs">
                      <div className="text-[var(--color-text-muted)]">{"// Full type safety"}</div>
                      <div className="mt-2">
                        <span className="text-[var(--color-purple)]">const</span>{" "}
                        <span className="text-[var(--color-text)]">files</span>
                        <span className="text-[var(--color-text-muted)]">:</span>{" "}
                        <span className="text-[var(--color-blue)]">string[]</span>
                      </div>
                      <div className="pl-3">
                        <span className="text-[var(--color-text-muted)]">= await</span>{" "}
                        <span className="text-[var(--color-accent)]">glob</span>(
                        <span className="text-[var(--color-pink)]">&apos;**/*.ts&apos;</span>,{" "}
                        {"{"}
                      </div>
                      <div className="pl-8">
                        <span className="text-[var(--color-text)]">ignore</span>
                        <span className="text-[var(--color-text-muted)]">:</span>{" "}
                        [<span className="text-[var(--color-pink)]">&apos;node_modules/**&apos;</span>],
                      </div>
                      <div className="pl-8">
                        <span className="text-[var(--color-text)]">dot</span>
                        <span className="text-[var(--color-text-muted)]">:</span>{" "}
                        <span className="text-[var(--color-orange)]">true</span>
                      </div>
                      <div className="pl-3">{"}"});</div>
                    </div>
                  </div>
                </div>
              </AnimateIn>

              {/* Row 3: Wide + single */}
              {/* Card 6: File matching visual (wide) */}
              <AnimateIn className="bento-card bento-card-wide" delay={0.08}>
                <div className="bento-card-inner p-8 sm:p-10 h-full">
                  <div className="grid md:grid-cols-2 gap-10 h-full">
                    <div className="flex flex-col justify-center">
                      <span className="tag tag-orange mb-6 w-fit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        Matching
                      </span>
                      <h3 className="text-2xl sm:text-3xl font-bold mb-4">Lightning-fast file matching</h3>
                      <p className="text-[var(--color-text-secondary)] mb-8 leading-relaxed">
                        Optimized directory traversal with depth-limited walking,
                        prefix-based pruning, and Rust-compiled patterns for
                        maximum throughput.
                      </p>
                      <div className="code-block inline-block">
                        <div className="code-block-header">
                          <div className="code-block-dot" />
                          <div className="code-block-dot" />
                          <div className="code-block-dot" />
                        </div>
                        <div className="code-block-body">
                          <span className="text-[var(--color-text-muted)]">❯ </span>
                          <span className="text-[var(--color-purple)]">await</span>{" "}
                          <span className="text-[var(--color-accent)]">glob</span>(
                          <span className="text-[var(--color-pink)]">&apos;**/*.ts&apos;</span>)
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-6">
                        <div className="text-xs text-[var(--color-text-muted)] mb-4 font-mono flex items-center gap-2">
                          <svg className="w-3 h-3 text-[var(--color-accent)]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          5 files matched
                        </div>
                        <FileTree />
                      </div>
                    </div>
                  </div>
                </div>
              </AnimateIn>

              {/* Card 7: Battle-tested */}
              <AnimateIn className="bento-card" delay={0.12}>
                <div className="bento-card-inner p-8 h-full flex flex-col">
                  <span className="tag tag-green mb-6 w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Quality
                  </span>
                  <h3 className="text-xl font-bold mb-2">Battle-tested</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                    Differential testing ensures identical results to glob
                    across every platform.
                  </p>
                  <div className="space-y-3 flex-1 flex flex-col justify-end">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs text-[var(--color-text-muted)]">Code coverage</span>
                        <span className="text-sm font-mono font-bold text-[var(--color-accent)]">90%+</span>
                      </div>
                      <div className="h-2 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-dim)] rounded-full coverage-bar" style={{ width: "92%" }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4 text-center">
                        <div className="text-xl font-bold font-mono text-[var(--color-text)]">22</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-1">options</div>
                      </div>
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4 text-center">
                        <div className="text-xl font-bold font-mono text-[var(--color-text)]">6</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-1">core APIs</div>
                      </div>
                    </div>
                  </div>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* ── Use Cases ── */}
        <section className="px-6 py-32 section-gradient">
          <div className="mx-auto max-w-[1200px]">
            <AnimateIn>
              <div className="max-w-2xl mx-auto text-center mb-20">
                <h2 className="text-3xl sm:text-5xl font-bold mb-5 tracking-tight">
                  Built for your <span className="text-gradient">toolchain</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] text-lg">
                  Globlin shines wherever fast file matching matters.
                </p>
              </div>
            </AnimateIn>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "Build tools", desc: "Webpack, Rollup, esbuild plugins", icon: "M11.42 15.17l-5.664-3.265a.75.75 0 010-1.302l5.664-3.265a.75.75 0 01.756 0l5.664 3.265a.75.75 0 010 1.302l-5.664 3.265a.75.75 0 01-.756 0z M4.5 14.11l7.177 4.131a.75.75 0 00.746 0L19.5 14.11" },
                { title: "Test runners", desc: "Jest, Vitest, Mocha file discovery", icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" },
                { title: "Linters", desc: "ESLint, Prettier file matching", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
                { title: "Monorepos", desc: "Multi-package traversal at scale", icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" },
              ].map((item, i) => (
                <AnimateIn key={item.title} delay={i * 0.06}>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-7 hover-lift h-full">
                    <svg className="w-6 h-6 text-[var(--color-accent)] mb-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    <div className="font-semibold mb-2">{item.title}</div>
                    <div className="text-sm text-[var(--color-text-muted)] leading-relaxed">{item.desc}</div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* ── Full API ── */}
        <section className="px-6 py-32 section-gradient">
          <div className="mx-auto max-w-[1200px]">
            <AnimateIn>
              <div className="max-w-2xl mx-auto text-center mb-20">
                <h2 className="text-3xl sm:text-5xl font-bold mb-5 tracking-tight">
                  Complete <span className="text-gradient-warm">API coverage</span>
                </h2>
                <p className="text-[var(--color-text-secondary)] text-lg">
                  Every function, option, and pattern from glob v13. Nothing left behind.
                </p>
              </div>
            </AnimateIn>

            <div className="grid lg:grid-cols-2 gap-6">
              <AnimateIn delay={0}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 hover-lift h-full">
                  <h3 className="font-semibold text-xl mb-3">All interfaces</h3>
                  <p className="text-[var(--color-text-secondary)] mb-6 text-sm">
                    6 core functions, streaming, iterators, and the full Glob class.
                  </p>
                  <div className="code-block">
                    <div className="code-block-header">
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                      <div className="code-block-dot" />
                    </div>
                    <div className="code-block-body">
                      <pre className="text-[var(--color-text)]">
<span className="text-[var(--color-text-muted)]">{"// Async"}</span>{"\n"}
<span className="text-[var(--color-purple)]">const</span> files = <span className="text-[var(--color-purple)]">await</span> <span className="text-[var(--color-accent)]">glob</span>(<span className="text-[var(--color-pink)]">&apos;**/*.ts&apos;</span>){"\n\n"}
<span className="text-[var(--color-text-muted)]">{"// Sync"}</span>{"\n"}
<span className="text-[var(--color-purple)]">const</span> sync = <span className="text-[var(--color-accent)]">globSync</span>(<span className="text-[var(--color-pink)]">&apos;*.js&apos;</span>){"\n\n"}
<span className="text-[var(--color-text-muted)]">{"// Streaming"}</span>{"\n"}
<span className="text-[var(--color-purple)]">const</span> stream = <span className="text-[var(--color-accent)]">globStream</span>(<span className="text-[var(--color-pink)]">&apos;src/**/*&apos;</span>){"\n\n"}
<span className="text-[var(--color-text-muted)]">{"// Iterator"}</span>{"\n"}
<span className="text-[var(--color-purple)]">for await</span> (<span className="text-[var(--color-purple)]">const</span> f <span className="text-[var(--color-purple)]">of</span> <span className="text-[var(--color-accent)]">globIterate</span>(<span className="text-[var(--color-pink)]">&apos;**/*&apos;</span>)) {"{"}...{"}"}
                      </pre>
                    </div>
                  </div>
                </div>
              </AnimateIn>

              <AnimateIn delay={0.08}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 hover-lift h-full">
                  <h3 className="font-semibold text-xl mb-3">All 22 options</h3>
                  <p className="text-[var(--color-text-secondary)] mb-6 text-sm">
                    Every glob v13 option is supported — cwd, dot, ignore, follow, and more.
                  </p>
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    {[
                      "cwd", "dot", "ignore", "follow",
                      "nodir", "absolute", "nocase", "maxDepth",
                      "mark", "dotRelative", "withFileTypes", "signal",
                    ].map((opt) => (
                      <div key={opt} className="flex items-center justify-center p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 text-[var(--color-accent)]">
                        {opt}
                      </div>
                    ))}
                  </div>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* ── Why faster ── */}
        <section className="px-6 py-32 section-gradient">
          <div className="mx-auto max-w-[1200px]">
            <AnimateIn>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 sm:p-14 relative overflow-hidden">
                <div className="absolute -right-24 -top-24 w-96 h-96 bg-[var(--color-accent)] opacity-[0.025] rounded-full blur-[100px]" />
                <div className="absolute -left-24 -bottom-24 w-72 h-72 bg-[var(--color-pink)] opacity-[0.02] rounded-full blur-[80px]" />
                <div className="relative z-10 max-w-3xl">
                  <h2 className="text-2xl sm:text-4xl font-bold mb-5 tracking-tight">Why is it faster?</h2>
                  <p className="text-[var(--color-text-secondary)] text-lg mb-10 leading-relaxed">
                    Glob operations are I/O-bound — ~85% of execution time is spent in
                    readdir syscalls. Globlin optimizes both I/O and CPU paths.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-8">
                    {[
                      { title: "I/O reduction", desc: "Depth-limited walking, prefix-based traversal, and intelligent directory pruning.", color: "var(--color-accent)" },
                      { title: "CPU optimization", desc: "Rust pattern matching, fast-path extensions, compiled patterns, and arena allocators.", color: "var(--color-pink)" },
                      { title: "Static patterns", desc: "Near-instant lookups for non-magic patterns — no directory traversal needed.", color: "var(--color-orange)" },
                    ].map((item) => (
                      <div key={item.title}>
                        <div className="text-sm font-semibold mb-2.5" style={{ color: item.color }}>{item.title}</div>
                        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AnimateIn>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 section-gradient">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
              <span>From the team behind</span>
              <a
                href="https://cap.so"
                className="inline-flex items-center gap-1.5 text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors font-medium"
              >
                Cap
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a href="https://github.com/CapSoftware/globlin" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                GitHub
              </a>
              <a href="https://npmjs.com/package/globlin" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
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
