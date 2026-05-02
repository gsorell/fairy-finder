import { useEffect, useState } from "react";

// Detect touch-capable devices. We show the on-screen controls whenever the
// device has any touch input — including hybrid laptops/tablets — because
// hiding them on hybrids leaves touch users stranded with no way to play.
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    if (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) return true;
    if ("ontouchstart" in window) return true;
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => {
      const has =
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
        "ontouchstart" in window ||
        mq.matches;
      setIsTouch(!!has);
    };
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isTouch;
}

function HoldButton({ keysRef, keyName, label, ariaLabel, onPress, className = "", style = {} }) {
  const setKey = (val) => {
    if (keysRef?.current) keysRef.current[keyName] = val;
  };
  const release = () => setKey(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress?.();
        setKey(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        release();
      }}
      onPointerLeave={(e) => {
        if (e.buttons) release();
      }}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none active:scale-95 transition-transform rounded-2xl font-bold text-white flex items-center justify-center ${className}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        touchAction: "none",
        userSelect: "none",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function TapButton({ onTap, label, ariaLabel, onPress, className = "", style = {} }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress?.();
        onTap?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none active:scale-95 transition-transform rounded-xl font-semibold text-white flex items-center justify-center ${className}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        touchAction: "none",
        userSelect: "none",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

// Bottom-of-screen movement pad. Left/Right on the left, big Jump on the right.
// Writes into `keysRef` so the existing keyboard logic doesn't change.
export function TouchControls({ keysRef, jumpKey = " ", showRestart = false, onRestart, onPress }) {
  const isTouch = useIsTouchDevice();
  if (!isTouch) return null;

  const dirBtn =
    "w-20 h-20 sm:w-24 sm:h-24 text-3xl bg-white/15 hover:bg-white/20 border border-white/20 backdrop-blur";
  const jumpBtn =
    "w-28 h-28 sm:w-32 sm:h-32 text-2xl bg-amber-500/80 hover:bg-amber-500 border border-amber-300/40 shadow-lg";

  return (
    <div className="max-w-[960px] w-full flex items-center justify-between gap-4 px-2 mt-1">
      <div className="flex gap-3">
        <HoldButton keysRef={keysRef} keyName="arrowleft" label="◀" ariaLabel="Move left" onPress={onPress} className={dirBtn} />
        <HoldButton keysRef={keysRef} keyName="arrowright" label="▶" ariaLabel="Move right" onPress={onPress} className={dirBtn} />
      </div>
      <div className="flex items-center gap-3">
        {showRestart && (
          <TapButton
            onTap={onRestart}
            label="↻"
            ariaLabel="Restart level"
            onPress={onPress}
            className="w-14 h-14 text-xl bg-white/10 hover:bg-white/20 border border-white/20"
          />
        )}
        <HoldButton keysRef={keysRef} keyName={jumpKey} label="JUMP" ariaLabel="Jump" onPress={onPress} className={jumpBtn} />
      </div>
    </div>
  );
}

// Always-visible "Back to game select" button. Useful on touch devices that
// have no Escape key, but harmless on desktop.
export function BackButton({ onBack, className = "" }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-slate-200 transition ${className}`}
    >
      ← Back
    </button>
  );
}

export default TouchControls;
