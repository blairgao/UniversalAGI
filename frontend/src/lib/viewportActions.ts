/** Imperative hooks the viewport registers so UI chrome (top bar) can call into the 3D scene. */
export const viewportActions: { fitView: (() => void) | null } = {
  fitView: null,
};
