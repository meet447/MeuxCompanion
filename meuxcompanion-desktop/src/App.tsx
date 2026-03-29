import { useWindow } from "./hooks/useWindow";
import { MiniWidget } from "./components/MiniWidget";

function App() {
  const { isMiniMode, toggleMini } = useWindow();

  if (isMiniMode) {
    return (
      <MiniWidget
        avatarComponent={
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
            }}
          >
            Avatar
          </div>
        }
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        padding: "20px",
      }}
    >
      <h1>MeuxCompanion Desktop</h1>
      <p>Main app view — components will be ported here</p>
      <button onClick={toggleMini}>Mini Mode</button>
    </div>
  );
}

export default App;
