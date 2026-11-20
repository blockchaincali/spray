import { useEffect, useState } from "react";
import { Banner } from "./Banner";
import { Footer, Nav } from "./Chrome";
import { ConnectDialog } from "./ConnectDialog";
import { Guest } from "./Guest";
import { Home } from "./Home";
import { Host } from "./Host";
import { Overlay } from "./Overlay";
import { Screen } from "./Screen";
import { decodeSession } from "./session";
import { useWallet } from "./useWallet";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const wallet = useWallet();
  const [, kind, token] = hash.match(/^#\/(\w+)\/?(.*)$/) ?? [];
  const session = token ? decodeSession(token) : null;

  if (kind === "o" && session) return <Overlay session={session} />;

  let page;
  if (kind === "s" && session) page = <Screen session={session} />;
  else if (kind === "g" && session) page = <Guest session={session} wallet={wallet} />;
  else if (kind === "new") page = <Host wallet={wallet} />;
  else if (token && !session) page = <main className="host"><h1>That party link looks broken.</h1><p className="lede">Ask the host to share it again, or <a href="#/new">start your own party</a>.</p></main>;
  else page = <Home />;

  return (
    <div className={`app page-${kind ?? "home"}`}>
      <Banner />
      {kind !== "s" && <Nav />}
      {page}
      {kind !== "s" && <Footer />}
      <ConnectDialog wallet={wallet} />
    </div>
  );
}
