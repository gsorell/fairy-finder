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

        {/* Ring Swinger card */}
        <button
          onClick={() => onSelect("ring-swinger")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #3d2c66 0%, #d27a78 100%)",
            border: "2px solid #ffd29a55",
            boxShadow: "0 4px 32px #d27a7820",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #ffd29a, 0 4px 40px #d27a7840")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #d27a7820")}
        >
          {/* Mini game preview — Ponyo evening playground */}
          <div className="flex items-end rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "linear-gradient(180deg, #1f1944 0%, #7d4d80 40%, #f5a06f 78%, #ffd29a 100%)", position: "relative" }}>
            {/* setting sun */}
            <div style={{
              position: "absolute", left: 110, top: 56, width: 56, height: 56, borderRadius: "50%",
              background: "radial-gradient(circle at 45% 35%, #fff7d6 0%, #ffe19a 45%, #ffaf72 85%, #ee8455 100%)",
              boxShadow: "0 0 22px #ffc18aaa",
            }} />
            {/* hills */}
            <svg style={{ position: "absolute", inset: 0 }} width="200" height="128">
              <path d="M0,96 Q40,82 80,90 Q120,76 160,86 Q190,80 200,88 L200,108 L0,108 Z"
                fill="#5e3f6e" />
              <path d="M0,104 Q30,94 70,100 Q110,94 150,102 Q180,98 200,104 L200,112 L0,112 Z"
                fill="#3a2347" />
              {/* ocean strip */}
              <rect x="0" y="112" width="200" height="6" fill="#a86c7a" />
              <rect x="92" y="113" width="34" height="1" fill="#ffe7be" opacity="0.7" />
              <rect x="98" y="115" width="22" height="1" fill="#ffba87" opacity="0.6" />
              {/* sand */}
              <rect x="0" y="118" width="200" height="10" fill="#e9b07a" />
              {/* monkey-bar top — coral */}
              <line x1="20" y1="24" x2="180" y2="24" stroke="#e2603e" strokeWidth="3" />
              <line x1="20" y1="22" x2="180" y2="22" stroke="#ffb89a" strokeWidth="0.8" opacity="0.8" />
              {/* chains */}
              <line x1="60" y1="25" x2="60" y2="62" stroke="#d6c4a8" strokeWidth="1" />
              <line x1="110" y1="25" x2="120" y2="60" stroke="#d6c4a8" strokeWidth="1" />
              <line x1="160" y1="25" x2="160" y2="64" stroke="#d6c4a8" strokeWidth="1" />
              {/* rings */}
              <circle cx="60" cy="64" r="5" fill="none" stroke="#7bc6e0" strokeWidth="2" />
              <circle cx="120" cy="62" r="5" fill="none" stroke="#ff8c66" strokeWidth="2" />
              <circle cx="160" cy="66" r="5" fill="none" stroke="#ffd76b" strokeWidth="2" />
            </svg>
            {/* swinger */}
            <div style={{ position: "absolute", left: 116, top: 60, fontSize: 14, lineHeight: 1 }}>🧑</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#fff4d6" }}>Ring Swinger</div>
            <div className="text-sm mt-1" style={{ color: "#ffd29a" }}>Sunset playground • pendulum</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#e2603e", color: "#fff4d6" }}>
            Play →
          </div>
        </button>

        {/* Bubbly Whale card */}
        <button
          onClick={() => onSelect("whale-game")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #12608f 0%, #1b8fc9 100%)",
            border: "2px solid #7fd4ff55",
            boxShadow: "0 4px 32px #1b8fc920",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #7fd4ff, 0 4px 40px #1b8fc960")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #1b8fc920")}
        >
          {/* Mini game preview — underwater whale scene */}
          <div className="flex items-end rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "linear-gradient(180deg, #1a6fb0 0%, #1b8fc9 55%, #0e5a8a 100%)", position: "relative" }}>
            {/* light rays */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 40%, #eaffff22 50%, transparent 60%)" }} />
            {/* bubbles */}
            <div style={{ position: "absolute", left: 150, top: 30, width: 8, height: 8, borderRadius: "50%", border: "1px solid #ffffff88" }} />
            <div style={{ position: "absolute", left: 168, top: 54, width: 5, height: 5, borderRadius: "50%", border: "1px solid #ffffff88" }} />
            <div style={{ position: "absolute", left: 40, top: 20, width: 6, height: 6, borderRadius: "50%", border: "1px solid #ffffff77" }} />
            {/* whale + shrimp */}
            <div style={{ position: "absolute", left: 52, top: 44, fontSize: 44, lineHeight: 1 }}>🐳</div>
            <div style={{ position: "absolute", left: 132, top: 60, fontSize: 20, lineHeight: 1, transform: "scaleX(-1)" }}>🦐</div>
            <div style={{ position: "absolute", left: 24, top: 88, fontSize: 16, lineHeight: 1 }}>🦐</div>
            {/* sparkles */}
            <div style={{ position: "absolute", left: 96, top: 30, fontSize: 14 }}>✨</div>
            {/* seabed */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 16, background: "#e6cf9a" }} />
            <div style={{ position: "absolute", left: 20, bottom: 12, fontSize: 16 }}>🪸</div>
            <div style={{ position: "absolute", right: 24, bottom: 12, fontSize: 16 }}>🌿</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#eaf7ff" }}>Bubbly Whale</div>
            <div className="text-sm mt-1" style={{ color: "#a7ddff" }}>Eat shrimp • dress-up • no losing</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#ff7fc4", color: "#fff" }}>
            Swim →
          </div>
        </button>

        {/* Crystal Quest card */}
        <button
          onClick={() => onSelect("crystal-quest")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #05060f 0%, #0d1330 100%)",
            border: "2px solid #1fb0d655",
            boxShadow: "0 4px 32px #1fb0d620",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #5cf0ff, 0 4px 40px #1fb0d660")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #1fb0d620")}
        >
          {/* Mini game preview — neon vector arena */}
          <div className="flex items-end rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "radial-gradient(ellipse at 50% 40%, #0d1330 0%, #05060f 75%)", position: "relative" }}>
            <svg style={{ position: "absolute", inset: 0 }} width="200" height="128">
              {/* arena border with a gate gap on the right */}
              <path d="M12,12 L188,12 M188,12 L188,52 M188,76 L188,116 M188,116 L12,116 M12,116 L12,12"
                stroke="#5cf0ff" strokeWidth="2" fill="none" />
              {/* gate posts */}
              <circle cx="188" cy="52" r="2.5" fill="#5cff9e" />
              <circle cx="188" cy="76" r="2.5" fill="#5cff9e" />
              {/* crystals */}
              {[[48, 40], [150, 34], [66, 92], [128, 88], [98, 60]].map(([x, y], i) => (
                <path key={i} d={`M${x},${y - 6} L${x + 5},${y} L${x},${y + 6} L${x - 5},${y} Z`}
                  fill={`hsl(${i * 60 + 180}, 90%, 62%)`} />
              ))}
              {/* mine */}
              <g stroke="#ff5470" strokeWidth="1.5">
                <line x1="40" y1="72" x2="40" y2="82" />
                <line x1="35" y1="77" x2="45" y2="77" />
                <line x1="36" y1="73" x2="44" y2="81" />
                <line x1="44" y1="73" x2="36" y2="81" />
              </g>
              <circle cx="40" cy="77" r="3" fill="#ff5470" />
            </svg>
            {/* ship */}
            <div style={{ position: "absolute", left: 92, top: 58, fontSize: 20, lineHeight: 1, color: "#5cf0ff", textShadow: "0 0 8px #5cf0ff", transform: "rotate(12deg)" }}>➤</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#bfe3ff" }}>Crystal Quest</div>
            <div className="text-sm mt-1" style={{ color: "#5cf0ff" }}>Neon flyer • collect & escape</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#1fb0d6", color: "#eaffff" }}>
            Launch →
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

        {/* Muay Thai Knockout card */}
        <button
          onClick={() => onSelect("muay-thai")}
          className="group relative flex flex-col items-center gap-4 rounded-2xl px-10 py-9 cursor-pointer transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #1c0f1a 0%, #3a0d1c 100%)",
            border: "2px solid #c9303055",
            boxShadow: "0 4px 32px #c9303020",
            outline: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 3px #ffe04a, 0 4px 40px #c9303060")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 4px 32px #c9303020")}
        >
          {/* Mini game preview — boxing ring */}
          <div className="flex items-end rounded-xl overflow-hidden"
            style={{ width: 200, height: 128, background: "linear-gradient(180deg, #1c0f1a 0%, #2a0c14 60%, #3a1a0e 100%)", position: "relative" }}>
            {/* spotlight */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 35%, #ffe04a22 0%, transparent 60%)" }} />
            {/* ring ropes */}
            <svg style={{ position: "absolute", inset: 0 }} width="200" height="128">
              <line x1="10" y1="70" x2="190" y2="70" stroke="#c93030" strokeWidth="2" />
              <line x1="10" y1="80" x2="190" y2="80" stroke="#ffe04a" strokeWidth="2" />
              <line x1="10" y1="90" x2="190" y2="90" stroke="#c93030" strokeWidth="2" />
              {/* posts */}
              <rect x="6" y="64" width="6" height="38" fill="#7a0d1c" />
              <rect x="188" y="64" width="6" height="38" fill="#7a0d1c" />
            </svg>
            {/* canvas mat */}
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 8, height: 18, background: "#5a1f1a", borderRadius: 2 }} />
            {/* fighters */}
            <div style={{ position: "absolute", left: 56, bottom: 26, fontSize: 22, lineHeight: 1 }}>🥊</div>
            <div style={{ position: "absolute", right: 56, bottom: 26, fontSize: 22, lineHeight: 1, transform: "scaleX(-1)" }}>🥊</div>
            {/* title-ish star */}
            <div style={{ position: "absolute", left: 90, top: 14, fontSize: 18, color: "#ffe04a", textShadow: "0 0 8px #ffe04a88" }}>★</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: "#ffe04a" }}>Muay Thai</div>
            <div className="text-sm mt-1" style={{ color: "#f3a3a3" }}>Knockout • 16-bit slugfest</div>
          </div>

          <div className="text-xs px-4 py-1.5 rounded-full font-semibold transition-all"
            style={{ background: "#c93030", color: "#ffe04a" }}>
            Fight →
          </div>
        </button>
      </div>

      <p className="mt-12 text-sm" style={{ color: "#334155" }}>
        Arrow keys or click to choose — ESC inside a game to return here
      </p>
    </div>
  );
}
