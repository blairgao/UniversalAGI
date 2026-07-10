import { useStore, type GizmoMode } from "../store";

const MODES: { id: GizmoMode; label: string; icon: string; hint: string }[] = [
  { id: "none", label: "View", icon: "\u2316", hint: "Orbit / inspect only" },
  { id: "translate", label: "Move", icon: "\u2725", hint: "Drag gizmo to move" },
  { id: "rotate", label: "Rotate", icon: "\u21bb", hint: "Drag gizmo to rotate" },
  { id: "scale", label: "Scale", icon: "\u2922", hint: "Drag gizmo to scale" },
];

export function ToolRail() {
  const gizmoMode = useStore((s) => s.gizmoMode);
  const setGizmoMode = useStore((s) => s.setGizmoMode);
  const hasModel = useStore((s) => s.positions !== null);

  return (
    <nav className="tool-rail">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={gizmoMode === m.id ? "active" : ""}
          disabled={!hasModel && m.id !== "none"}
          title={`${m.label} — ${m.hint}`}
          onClick={() => setGizmoMode(m.id)}
        >
          <span className="tool-icon">{m.icon}</span>
          <span className="tool-label">{m.label}</span>
        </button>
      ))}
    </nav>
  );
}
