import React from "react";

export default function GameSelect({ onSelect }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-svh select-none" style={{ background: "#0b0f1e" }}>
      <h1
        className="text-5xl font-bold tracking-wide mb-2"
        style={{ color: "#facc15", textShadow: "0 0 24px #fbbf2455" }}
      >
        Ohana Arcade
      </h1>
      <p className="text-lg mb-14" style={{ color: "#94a3b8" }}>
        Pick a game to play
      </p>

      <div className="flex gap-10 flex-wrap justify-center px-6">
        {/* Fairy Finder card */}
        <button
          onClick={() => onSelect("fairy-finder")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
            border: "2px solid #4338ca55",
            boxShadow: "0 4px 32px #4f46e520",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #818cf8, 0 4px 40px #6366f140")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #4f46e520")}
        >
          {/* Mini game preview — fairy emoji art */}
          <div className="flex flex-col items-center justify-end gap-1 rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "linear-gradient(#86d5ff, #d8f7ff)", position: "relative" }}>
            {/* ground */}
            <div style={{ width: "100%", height: 24, background: "#7b4f2a", borderRadius: "0 0 12px 12px", flexShrink: 0 }} />
            {/* platform */}
            <div style={{ position: "absolute", left: 36, bottom: 44, width: 64, height: 10, background: "#c8a46a", borderRadius: 4 }} />
            {/* fairy glow */}
            <div style={{ position: "absolute", right: 28, bottom: 58, fontSize: 28, lineHeight: 1 }}>🧚</div>
            {/* character */}
            <div style={{ position: "absolute", left: 20, bottom: 24, fontSize: 20, lineHeight: 1 }}>🧑</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#e0e7ff" }}>Fairy Finder</div>
            <div className="text-sm mt-1" style={{ color: "#a5b4fc" }}>Ohana Quest • platformer</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#4f46e5", color: "#e0e7ff" }}>
            Play →
          </div>
        </button>

        {/* Wire Runner card */}
        <button
          onClick={() => onSelect("wire-runner")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #0c1a2e 0%, #0f2942 100%)",
            border: "2px solid #0ea5e955",
            boxShadow: "0 4px 32px #0ea5e920",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #38bdf8, 0 4px 40px #0ea5e940")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #0ea5e920")}
        >
          {/* Mini game preview — wire runner scene */}
          <div className="flex items-end rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "linear-gradient(#0b1020, #1e293b)", position: "relative" }}>
            {/* sky glow */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #0369a133 0%, transparent 70%)" }} />
            {/* poles */}
            {[30, 90, 150].map((x, i) => (
              <div key={i} style={{ position: "absolute", left: x, bottom: 32, width: 4, height: 55 + i * 8, background: "#475569", borderRadius: 2 }} />
            ))}
            {/* wire */}
            <svg style={{ position: "absolute", inset: 0 }} width="200" height="128">
              <path d="M30,73 Q60,90 90,81 Q120,72 150,65" stroke="#94a3b8" strokeWidth="1.5" fill="none" />
            </svg>
            {/* character on wire */}
            <div style={{ position: "absolute", left: 56, bottom: 42, fontSize: 18, lineHeight: 1 }}>🧑</div>
            {/* ground */}
            <div style={{ width: "100%", height: 20, background: "#1e293b", borderTop: "2px solid #334155", flexShrink: 0 }} />
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#e0f2fe" }}>Wire Runner</div>
            <div className="text-sm mt-1" style={{ color: "#7dd3fc" }}>Endless runner • highscore</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#0284c7", color: "#e0f2fe" }}>
            Play →
          </div>
        </button>
      </div>

      <p className="mt-12 text-sm" style={{ color: "#334155" }}>
        Arrow keys or click to choose — ESC inside a game to return here
      </p>
    </div>
  );
}
