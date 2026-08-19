import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className={className}
      style={{
        position: "relative",
        width: "80px",
        height: "40px",
        borderRadius: "20px",
        border: "2px solid #2DD4BF",
        background: "#2DD4BF",
        cursor: "pointer",
        outline: "none",
        padding: 0,
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: isDark
          ? "0 0 14px rgba(45,212,191,0.5), 0 0 28px rgba(45,212,191,0.2)"
          : "0 2px 10px rgba(45,212,191,0.4)",
        transition: "box-shadow 0.5s ease",
      }}
    >
      {/* Sun icon — LEFT side (visible in Light mode) */}
      <div
        style={{
          position: "absolute",
          left: "5px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "26px",
          height: "26px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isDark ? 0 : 1,
          transition: "opacity 0.3s ease",
          zIndex: 1,
        }}
      >
        <svg viewBox="0 0 64 64" width="22" height="22" fill="none">
          <circle cx="32" cy="32" r="13" fill="#FFD700" />
          <circle cx="32" cy="8"  r="4" fill="#FFD700" />
          <circle cx="32" cy="56" r="4" fill="#FFD700" />
          <circle cx="8"  cy="32" r="4" fill="#FFD700" />
          <circle cx="56" cy="32" r="4" fill="#FFD700" />
          <circle cx="15" cy="15" r="3.5" fill="#FFD700" />
          <circle cx="49" cy="15" r="3.5" fill="#FFD700" />
          <circle cx="15" cy="49" r="3.5" fill="#FFD700" />
          <circle cx="49" cy="49" r="3.5" fill="#FFD700" />
        </svg>
      </div>

      {/* Moon icon — RIGHT side (visible in Dark mode) */}
      <div
        style={{
          position: "absolute",
          right: "4px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "28px",
          height: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isDark ? 1 : 0,
          transition: "opacity 0.3s ease",
          zIndex: 1,
        }}
      >
        <svg viewBox="0 0 64 64" width="24" height="24" fill="none">
          <path
            d="M44 36C37.4 39.2 29.2 37.2 25 31.2C20.8 25.2 22.2 17.2 27.6 13C18.8 14.4 12 22.2 12 31.6C12 42 20.4 50.4 30.8 50.4C38.8 50.4 45.6 45.4 48.4 38.2C47 37.6 45.4 36.9 44 36Z"
            fill="#FFD700"
          />
          <circle cx="46" cy="18" r="2.5" fill="#FFD700" />
          <circle cx="52" cy="28" r="1.8" fill="#FFD700" />
          <circle cx="50" cy="10" r="1.4" fill="#FFD700" />
        </svg>
      </div>

      {/* Sliding knob */}
      <div
        style={{
          position: "absolute",
          top: "3px",
          left: isDark ? "3px" : "calc(100% - 37px)",
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          transition: "left 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)",
          zIndex: 5,
        }}
      />
    </button>
  );
}
