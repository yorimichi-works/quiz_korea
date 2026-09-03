import { redirect } from 'next/navigation';

export default function Home() {
  // Keep the game in the top-level browsing context. Besides avoiding a blank
  // first paint in automated/user-agent captures, this keeps Firebase popup
  // auth and PWA installation out of an unnecessary iframe boundary.
  redirect('/game.html');
}
