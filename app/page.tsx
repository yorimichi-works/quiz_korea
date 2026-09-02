export default function Home() {
  return (
    <main className="game-frame-shell">
      <iframe
        className="game-frame"
        src="/game.html"
        title="Quiz Battle 빠른 대전"
        allow="fullscreen"
      />
    </main>
  );
}
