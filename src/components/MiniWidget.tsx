import { useWindow } from "../hooks/useWindow";

interface MiniWidgetProps {
  avatarComponent: React.ReactNode;
}

export function MiniWidget({ avatarComponent }: MiniWidgetProps) {
  const { expand } = useWindow();

  return (
    <div
      onClick={expand}
      style={{
        width: "100vw",
        height: "100vh",
        cursor: "pointer",
        background: "transparent",
        overflow: "hidden",
      }}
      data-tauri-drag-region
    >
      {avatarComponent}
    </div>
  );
}
