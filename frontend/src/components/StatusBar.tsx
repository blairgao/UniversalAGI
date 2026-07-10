import { cancelServerOperation, useStore } from "../store";

export function StatusBar() {
  const stats = useStore((s) => s.stats);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);

  return (
    <footer className="statusbar">
      <span>
        {stats ? `${stats.triangles.toLocaleString()} triangles` : "No model loaded"}
      </span>
      <span className="muted">units: mm</span>
      <div className="statusbar-spacer" />
      {error && (
        <span className="status-error" onClick={() => setError(null)} title="Click to dismiss">
          {error} ✕
        </span>
      )}
      {busy && (
        <span className="status-busy">
          <span className="spinner" />
          {busy}
          <button className="link" onClick={cancelServerOperation}>
            Cancel
          </button>
        </span>
      )}
    </footer>
  );
}
