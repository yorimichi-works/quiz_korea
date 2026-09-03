export default function Home() {
  return (
    <main className="game-frame-shell">
      <iframe
        className="game-frame"
        src="/game.html?v=2"
        title="먼저! — 실시간 1대1 버저 퀴즈"
        allow="fullscreen"
      />
    </main>
  );
}
