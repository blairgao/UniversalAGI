import { exportSTL, newFile, redo, undo, useStore, type DisplayMode } from "../store";
import { viewportActions } from "../lib/viewportActions";

const DISPLAY_MODES: { id: DisplayMode; label: string }[] = [
  { id: "shaded", label: "Shaded" },
  { id: "wireframe", label: "Wireframe" },
  { id: "xray", label: "X-Ray" },
];

export function TopBar() {
  const name = useStore((s) => s.name);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const busy = useStore((s) => s.busy);

  return (
    <header className="topbar">
      <div className="topbar-brand">STL Studio</div>
      <div className="topbar-name" title={name ?? undefined}>
        {name ?? "No model"}
      </div>
      <div className="topbar-group">
        <button disabled={!canUndo || !!busy} onClick={undo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button disabled={!canRedo || !!busy} onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)">
          Redo
        </button>
      </div>
      <div className="topbar-group segmented">
        {DISPLAY_MODES.map((m) => (
          <button
            key={m.id}
            className={displayMode === m.id ? "active" : ""}
            onClick={() => setDisplayMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="topbar-group">
        <button onClick={() => viewportActions.fitView?.()}>Fit view</button>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-group">
        <button className="primary" disabled={!name || !!busy} onClick={exportSTL}>
          Export STL
        </button>
        <button
          disabled={!!busy}
          onClick={() => {
            if (!name || confirm("Discard the current model? Unsaved work will be lost.")) {
              void newFile();
            }
          }}
        >
          New
        </button>
      </div>
    </header>
  );
}
