import { useState } from "react";

// Update these paths to wherever you store the images in your project
const SUN_IMG = "/images__1___1_-removebg-preview.png";
const MOON_IMG = "/night-sky-with-stars-and-moon-icon-flat-style-vector-Photoroom.png";

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        background: isDark ? "#0d1b2a" : "#f0f9ff",
        transition: "background 0.6s ease",
      }}
    >
      {/* Label */}
      <p
        style={{
          fontFamily: "sans-serif",
          fontSize: "16px",
          color: isDark ? "#a0c4d8" : "#555",
          letterSpacing: "0.05em",
          transition: "color 0.4s",
        }}
      >
        {isDark ? "Dark Mode" : "Light Mode"}
      </p>

      {/* Toggle */}
      <button
        onClick={() => setIsDark(!isDark)}
        aria-label="Toggle dark mode"
        style={{
          position: "relative",
          width: "160px",
          height: "80px",
          borderRadius: "40px",
          border: "3px solid #2DD4BF",
          background: "#2DD4BF",
          cursor: "pointer",
          outline: "none",
          padding: 0,
          overflow: "hidden",
          boxShadow: isDark
            ? "0 0 30px rgba(45,212,191,0.5), 0 0 60px rgba(45,212,191,0.2)"
            : "0 4px 20px rgba(45,212,191,0.4)",
          transition: "box-shadow 0.5s ease",
        }}
      >
        {/*
          LOGIC:
          ─────────────────────────────────────────────────────
          LIGHT MODE (isDark = false):
            • Knob → RIGHT side
            • Sun icon → LEFT side (visible, not covered by knob)
            • Moon icon → RIGHT side (hidden under knob + opacity 0)

          DARK MODE (isDark = true):
            • Knob → LEFT side
            • Moon icon → RIGHT side (visible, not covered by knob)
            • Sun icon → LEFT side (hidden under knob + opacity 0)
          ─────────────────────────────────────────────────────
        */}

        {/* Sun icon — LEFT side */}
        <div
          style={{
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "54px",
            height: "54px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: isDark ? 0 : 1,   // visible only in light mode
            transition: "opacity 0.3s ease",
            zIndex: 1,                  // below the knob (z-index 5)
          }}
        >
          <img
            src={SUN_IMG}
            alt="Sun"
            style={{ width: "50px", height: "50px", objectFit: "contain" }}
          />
        </div>

        {/* Moon icon — RIGHT side */}
        <div
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "58px",
            height: "58px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: isDark ? 1 : 0,   // visible only in dark mode
            transition: "opacity 0.3s ease",
            zIndex: 1,                  // below the knob (z-index 5)
          }}
        >
          <img
            src={MOON_IMG}
            alt="Moon and stars"
            style={{ width: "54px", height: "54px", objectFit: "contain" }}
          />
        </div>

        {/* Sliding knob — always on top (z-index 5) */}
        <div
          style={{
            position: "absolute",
            top: "6px",
            left: isDark ? "6px" : "calc(100% - 72px)",  // LEFT in dark, RIGHT in light
            width: "62px",
            height: "62px",
            borderRadius: "50%",
            background: "#ffffff",
            boxShadow: "0 3px 12px rgba(0,0,0,0.25)",
            transition: "left 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)",
            zIndex: 5,
          }}
        />
      </button>
    </div>
  );
}
