import { Matrix4, Vector3 } from "three";
import { applyMatrix, flipWindingInPlace } from "./stl";
import { commitPositions, useStore } from "../store";

function current(): Float32Array | null {
  return useStore.getState().positions;
}

function bboxCenter(positions: Float32Array): { center: Vector3; size: Vector3; minZ: number } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);
    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }
  return {
    center: min.clone().add(max).multiplyScalar(0.5),
    size: max.clone().sub(min),
    minZ: min.z,
  };
}

/** Apply a matrix about the model's bounding-box center. */
function applyAboutCenter(positions: Float32Array, m: Matrix4): Float32Array {
  const { center } = bboxCenter(positions);
  const full = new Matrix4()
    .makeTranslation(center.x, center.y, center.z)
    .multiply(m)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  return applyMatrix(positions, full.elements);
}

export function translateBy(dx: number, dy: number, dz: number): void {
  const positions = current();
  if (!positions) return;
  commitPositions(applyMatrix(positions, new Matrix4().makeTranslation(dx, dy, dz).elements));
}

export function rotateByDegrees(rx: number, ry: number, rz: number): void {
  const positions = current();
  if (!positions) return;
  const d = Math.PI / 180;
  const m = new Matrix4()
    .makeRotationZ(rz * d)
    .multiply(new Matrix4().makeRotationY(ry * d))
    .multiply(new Matrix4().makeRotationX(rx * d));
  commitPositions(applyAboutCenter(positions, m));
}

export function scaleByFactor(factor: number): void {
  const positions = current();
  if (!positions || factor <= 0) return;
  commitPositions(applyAboutCenter(positions, new Matrix4().makeScale(factor, factor, factor)));
}

/** Uniformly scale so the longest bounding-box dimension equals targetMm. */
export function scaleToSize(targetMm: number): void {
  const positions = current();
  if (!positions || targetMm <= 0) return;
  const { size } = bboxCenter(positions);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) return;
  scaleByFactor(targetMm / maxDim);
}

export function mirrorAxis(axis: "x" | "y" | "z"): void {
  const positions = current();
  if (!positions) return;
  const s = new Vector3(1, 1, 1);
  s[axis] = -1;
  commitPositions(applyAboutCenter(positions, new Matrix4().makeScale(s.x, s.y, s.z)));
}

/** Center the model on the origin in XY and drop it onto the build plate (z=0). */
export function centerOnPlate(): void {
  const positions = current();
  if (!positions) return;
  const { center, minZ } = bboxCenter(positions);
  commitPositions(
    applyMatrix(positions, new Matrix4().makeTranslation(-center.x, -center.y, -minZ).elements),
  );
}

/** Reverse the winding of every triangle (fixes inside-out models). */
export function flipNormals(): void {
  const positions = current();
  if (!positions) return;
  const copy = positions.slice();
  flipWindingInPlace(copy);
  commitPositions(copy);
}
