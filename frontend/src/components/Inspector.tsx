import { useState } from "react";
import { runServerOperation, useStore } from "../store";
import {
  centerOnPlate,
  flipNormals,
  mirrorAxis,
  rotateByDegrees,
  scaleByFactor,
  scaleToSize,
  translateBy,
} from "../lib/operations";

function fmt(v: number, digits = 2): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function Vec3Inputs({
  values,
  onChange,
}: {
  values: [string, string, string];
  onChange: (next: [string, string, string]) => void;
}) {
  return (
    <div className="vec3">
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <label key={axis}>
          <span>{axis}</span>
          <input
            type="number"
            step="any"
            value={values[i]}
            onChange={(e) => {
              const next = [...values] as [string, string, string];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

const num = (s: string) => (s === "" || Number.isNaN(Number(s)) ? 0 : Number(s));

export function Inspector() {
  const stats = useStore((s) => s.stats);
  const busy = useStore((s) => s.busy);
  const hasModel = useStore((s) => s.positions !== null);

  const [translate, setTranslate] = useState<[string, string, string]>(["0", "0", "0"]);
  const [rotate, setRotate] = useState<[string, string, string]>(["0", "0", "0"]);
  const [scaleFactor, setScaleFactor] = useState("1");
  const [targetSize, setTargetSize] = useState("100");
  const [decimatePercent, setDecimatePercent] = useState("50");

  if (!hasModel) return null;
  const disabled = !!busy;

  const size = stats
    ? ([0, 1, 2] as const).map((i) => stats.bboxMax[i] - stats.bboxMin[i])
    : null;

  return (
    <aside className="inspector">
      <section>
        <h3>Model</h3>
        {stats ? (
          <dl className="stats">
            <dt>Triangles</dt>
            <dd>{stats.triangles.toLocaleString()}</dd>
            <dt>Size (mm)</dt>
            <dd>{size ? `${fmt(size[0])} × ${fmt(size[1])} × ${fmt(size[2])}` : "—"}</dd>
            <dt>Surface area</dt>
            <dd>{fmt(stats.area / 100)} cm²</dd>
            <dt>Volume</dt>
            <dd>{fmt(stats.volume / 1000)} cm³</dd>
            <dt>Watertight</dt>
            <dd>
              {stats.watertight === null ? (
                <span className="badge neutral">not checked</span>
              ) : stats.watertight ? (
                <span className="badge good">yes</span>
              ) : (
                <span className="badge bad">no</span>
              )}
            </dd>
          </dl>
        ) : (
          <p className="muted">Computing…</p>
        )}
      </section>

      <section>
        <h3>Translate (mm)</h3>
        <Vec3Inputs values={translate} onChange={setTranslate} />
        <button
          disabled={disabled}
          onClick={() => translateBy(num(translate[0]), num(translate[1]), num(translate[2]))}
        >
          Apply move
        </button>
      </section>

      <section>
        <h3>Rotate (degrees)</h3>
        <Vec3Inputs values={rotate} onChange={setRotate} />
        <button
          disabled={disabled}
          onClick={() => rotateByDegrees(num(rotate[0]), num(rotate[1]), num(rotate[2]))}
        >
          Apply rotation
        </button>
      </section>

      <section>
        <h3>Scale</h3>
        <div className="row">
          <label className="inline">
            <span>Factor</span>
            <input
              type="number"
              step="any"
              min="0"
              value={scaleFactor}
              onChange={(e) => setScaleFactor(e.target.value)}
            />
          </label>
          <button disabled={disabled || num(scaleFactor) <= 0} onClick={() => scaleByFactor(num(scaleFactor))}>
            Apply
          </button>
        </div>
        <div className="row">
          <label className="inline">
            <span>Longest side (mm)</span>
            <input
              type="number"
              step="any"
              min="0"
              value={targetSize}
              onChange={(e) => setTargetSize(e.target.value)}
            />
          </label>
          <button disabled={disabled || num(targetSize) <= 0} onClick={() => scaleToSize(num(targetSize))}>
            Scale to size
          </button>
        </div>
      </section>

      <section>
        <h3>Tools</h3>
        <div className="button-grid">
          <button disabled={disabled} onClick={centerOnPlate} title="Center in XY, drop onto z=0">
            Center on plate
          </button>
          <button disabled={disabled} onClick={flipNormals} title="Reverse all triangle winding">
            Flip normals
          </button>
          <button disabled={disabled} onClick={() => mirrorAxis("x")}>Mirror X</button>
          <button disabled={disabled} onClick={() => mirrorAxis("y")}>Mirror Y</button>
          <button disabled={disabled} onClick={() => mirrorAxis("z")}>Mirror Z</button>
        </div>
      </section>

      <section>
        <h3>Server operations</h3>
        <button
          className="wide"
          disabled={disabled}
          title="Fill holes, fix winding and normals, remove degenerate triangles"
          onClick={() => runServerOperation("repair", "Repairing mesh…")}
        >
          Repair mesh
        </button>
        <div className="row">
          <label className="inline">
            <span>Keep % of faces</span>
            <input
              type="number"
              min="1"
              max="100"
              value={decimatePercent}
              onChange={(e) => setDecimatePercent(e.target.value)}
            />
          </label>
          <button
            disabled={disabled || !stats || num(decimatePercent) <= 0 || num(decimatePercent) >= 100}
            onClick={() => {
              const target = Math.max(
                4,
                Math.floor((stats!.triangles * num(decimatePercent)) / 100),
              );
              void runServerOperation("decimate", "Simplifying mesh…", {
                target_faces: target,
              });
            }}
          >
            Decimate
          </button>
        </div>
      </section>
    </aside>
  );
}
