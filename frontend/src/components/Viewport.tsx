import { Canvas, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { cameraRef, commitPositions, useStore } from "../store";
import { applyMatrix } from "../lib/stl";
import { viewportActions } from "../lib/viewportActions";

const MODEL_COLOR = "#7ea8d0";

function isIdentity(m: Matrix4): boolean {
  const identity = new Matrix4();
  for (let i = 0; i < 16; i++) {
    if (Math.abs(m.elements[i] - identity.elements[i]) > 1e-9) return false;
  }
  return true;
}

function Scene() {
  const positions = useStore((s) => s.positions);
  const normals = useStore((s) => s.normals);
  const geometryVersion = useStore((s) => s.geometryVersion);
  const displayMode = useStore((s) => s.displayMode);
  const gizmoMode = useStore((s) => s.gizmoMode);
  const name = useStore((s) => s.name);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [group, setGroup] = useState<Group | null>(null);

  const geometry = useMemo(() => {
    if (!positions || !normals) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
    // Rebuild only when geometry actually changes, not on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryVersion]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const center = useMemo(
    () => geometry?.boundingBox?.getCenter(new Vector3()) ?? new Vector3(),
    [geometry],
  );

  const fitView = useCallback(() => {
    const controls = controlsRef.current;
    if (!geometry?.boundingSphere || !controls) return;
    const { center: c, radius } = geometry.boundingSphere;
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
    const direction = new Vector3(1, -1, 0.65).normalize();
    camera.position.copy(c.clone().add(direction.multiplyScalar(distance)));
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = Math.max(distance * 100, 1000);
    camera.updateProjectionMatrix();
    controls.target.copy(c);
    controls.update();
  }, [geometry, camera]);

  useEffect(() => {
    viewportActions.fitView = fitView;
    return () => {
      viewportActions.fitView = null;
    };
  }, [fitView]);

  // On a newly opened or restored model: restore the saved camera, else frame the model.
  useEffect(() => {
    if (!geometry) return;
    const saved = cameraRef.current;
    if (saved) {
      camera.position.set(...saved.position);
      controlsRef.current?.target.set(...saved.target);
      controlsRef.current?.update();
    } else {
      fitView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const bakeGizmoTransform = useCallback(() => {
    if (!group || !positions) return;
    group.updateMatrix();
    const matrix = group.matrix
      .clone()
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    // Reset the group before committing; the rebuilt geometry carries the transform.
    group.position.copy(center);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    if (isIdentity(matrix)) return;
    commitPositions(applyMatrix(positions, matrix.elements));
  }, [group, positions, center]);

  const saveCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    cameraRef.current = {
      position: camera.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
    };
  }, [camera]);

  const meshOffset = useMemo(() => center.clone().negate(), [center]);

  return (
    <>
      <hemisphereLight intensity={0.45} color="#cdd6e4" groundColor="#3a4152" />
      <directionalLight position={[120, -100, 180]} intensity={1.1} />
      <directionalLight position={[-90, 120, 70]} intensity={0.35} />
      {geometry && (
        <group ref={setGroup} position={center}>
          <mesh
            geometry={geometry}
            position={meshOffset}
            onDoubleClick={(e) => {
              e.stopPropagation();
              controlsRef.current?.target.copy(e.point);
              controlsRef.current?.update();
              saveCamera();
            }}
          >
            {displayMode === "xray" ? (
              <meshStandardMaterial
                color={MODEL_COLOR}
                transparent
                opacity={0.35}
                depthWrite={false}
                roughness={0.5}
                metalness={0.1}
              />
            ) : (
              <meshStandardMaterial
                color={MODEL_COLOR}
                roughness={0.55}
                metalness={0.1}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
              />
            )}
          </mesh>
          {displayMode === "wireframe" && (
            <mesh geometry={geometry} position={meshOffset}>
              <meshBasicMaterial wireframe color="#101820" />
            </mesh>
          )}
        </group>
      )}
      {group && geometry && gizmoMode !== "none" && (
        <TransformControls
          object={group}
          mode={gizmoMode}
          space="world"
          onMouseUp={bakeGizmoTransform}
        />
      )}
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        infiniteGrid
        cellSize={10}
        sectionSize={100}
        cellColor="#2a3140"
        sectionColor="#3d4a63"
        fadeDistance={3000}
        fadeStrength={1.5}
      />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport
          axisColors={["#e06666", "#78c47c", "#6f8fe0"]}
          labelColor="white"
        />
      </GizmoHelper>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        onEnd={saveCamera}
      />
    </>
  );
}

export function Viewport() {
  return (
    <Canvas
      className="viewport-canvas"
      dpr={[1, 2]}
      camera={{ position: [120, -120, 90], up: [0, 0, 1], fov: 45, near: 0.1, far: 100000 }}
    >
      <color attach="background" args={["#14171e"]} />
      <Scene />
    </Canvas>
  );
}
