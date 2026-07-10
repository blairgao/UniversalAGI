import { useEffect, useState } from "react";
import { openFile, redo, restoreWorkspace, undo, useStore } from "./store";
import { TopBar } from "./components/TopBar";
import { ToolRail } from "./components/ToolRail";
import { Viewport } from "./components/Viewport";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { DropZone } from "./components/DropZone";

export default function App() {
  const hasModel = useStore((s) => s.positions !== null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void restoreWorkspace();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void openFile(file);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <ToolRail />
        <div className="viewport">
          <Viewport />
          {!hasModel && <DropZone />}
          {dragging && (
            <div className="drag-overlay">
              <span>Drop to load STL</span>
            </div>
          )}
        </div>
        <Inspector />
      </div>
      <StatusBar />
    </div>
  );
}
