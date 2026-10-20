import type { MouseEvent, ReactNode } from 'react';
import { href } from '../route';
import { Panel } from './ui';

/** One numbered tutorial step: a title, the page it happens on, and the instructions. */
function Step({ n, title, where, children }: { n: number; title: string; where?: ReactNode; children: ReactNode }) {
  return (
    <div className="guide-step">
      <div className="guide-num">{n}</div>
      <div className="grow">
        <h3>{title}</h3>
        {where && <div className="muted small">{where}</div>}
        {children}
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command</div>
          <h1>Getting started</h1>
        </div>
      </div>

      <div className="panel">
        <p style={{ margin: 0 }}>
          New to the Dataslate? This guide takes you from an Army Forge list to a crusade force, then shows how to keep it up to date and
          collect rewards from battles. If the group plays together, use <b>Sign in</b> in the top bar first and ask to join. The GM
          accepts you on the Settings page, and after that your forces and battles are shared with the other players.
        </p>
        <nav className="guide-toc small">
          <a href="#guide-books" onClick={jump}>1 · Import an army book</a>
          <a href="#guide-force" onClick={jump}>2 · Import your force</a>
          <a href="#guide-edit" onClick={jump}>3 · Edit your force</a>
          <a href="#guide-claim" onClick={jump}>4 · Claim battle rewards</a>
        </nav>
      </div>

      <Panel id="guide.books" domId="guide-books" title="1 · Import an army book">
        <p className="muted small" style={{ marginTop: 0 }}>
          The army book is your faction's catalog of datasheets, rules and spells. The app needs it before it can build your units with full
          stats. A book only has to be imported once, by anyone, and then the whole group has it.
        </p>
        <Step n={1} title="Copy the book's link from Army Forge" where="army-forge.onepagerules.com">
          <p>Open your army on Army Forge, then use <b>Share</b> or copy the address from the browser's address bar.</p>
        </Step>
        <Step n={2} title="Paste it on the Army Books page" where={<a href={href.books()}>Army Books</a>}>
          <p>
            Paste the link into <b>Add an army book</b> and press <b>Import</b>. It shows up under <b>Imported books</b>, where you can
            open <b>Browse</b> to look through its units, rules and spells.
          </p>
        </Step>
        <Step n={3} title="Keep it current">
          <p>
            When OPR updates the book, press <b>Refresh</b> next to it. Your tags are kept. While you're on this page, press
            <b> Fetch core rules</b> once so printed lists explain the core rules like AP and Tough.
          </p>
          <p className="small muted">
            Import failing? The book may be private. Make it public or unlisted in the Army Forge book editor, or open <b>Private book, or
            the fetch fails?</b> and drop the book's JSON file there.
          </p>
        </Step>
      </Panel>

      <Panel id="guide.import" domId="guide-force" title="2 · Import your force from Army Forge">
        <p className="muted small" style={{ marginTop: 0 }}>
          If you've already built your list on Army Forge, you don't have to enter it again. Importing it creates a crusade force with every
          unit, upgrade and weapon filled in, plus a matching battle list ready to print.
        </p>
        <Step n={1} title="Export the list from Army Forge" where="army-forge.onepagerules.com">
          <p>
            Open your saved list, open its menu, and <b>export</b> it. Army Forge saves a <code>.json</code> file to your computer.
          </p>
        </Step>
        <Step n={2} title="Drop the file on the Forces page" where={<a href={href.forces()}>Forces</a>}>
          <p>
            Scroll down to <b>Import</b> and drag the <code>.json</code> file onto the box, or click the box to pick the file. A new force
            card appears with your units and points.
          </p>
          <p className="small muted">
            If you get an error about a missing army book, do part 1 first. Lists that mix armies need every book they use.
          </p>
        </Step>
        <Step n={3} title="Upload it as yours">
          <p>
            While you're signed in, a newly imported force is only on your device. Press <b>Upload “…” as mine</b> in the notice at the top
            of the Forces page so the group can see it and only you can edit it.
          </p>
        </Step>
      </Panel>

      <Panel id="guide.edit" domId="guide-edit" title="3 · Edit your force">
        <p className="muted small" style={{ marginTop: 0 }}>Click a force card on the <a href={href.forces()}>Forces</a> page to open its Order of Battle.</p>
        <Step n={1} title="Force details" where="Right-hand panel">
          <p>
            Rename the force, set the faction, player and starting supply, add a picture, and write its lore. Changes save as soon as you
            click away from a field.
          </p>
        </Step>
        <Step n={2} title="Add units" where="+ Add unit">
          <p>
            Choose <b>From army book</b> to pick a datasheet and its upgrades, which fills in stats and points for you. You can also paste
            list text or start from a blank sheet. Tick <b>Only what I can afford</b> to see only units that fit your remaining Supply.
          </p>
        </Step>
        <Step n={3} title="Edit a unit" where="Click a unit row">
          <p>
            Each unit opens on its own sheet. Give it a crusade name, adjust its stats, add XP, and add traits, relics and battle scars.
            Use the status menu at the top to mark it <b>Comatose</b> or <b>Fallen</b>. Fallen units are hidden from the Order of Battle
            unless you tick <b>Show … fallen</b>.
          </p>
        </Step>
        <Step n={4} title="Spend requisition" where="Requisition ledger">
          <p>
            Use <b>Requisition…</b> to buy upgrades with RP, or <b>Increase supply</b> to trade 1 RP for more points. Every change is logged,
            and you can edit or delete entries.
          </p>
        </Step>
        <Step n={5} title="Build a battle list" where="Battle lists">
          <p>Press <b>+ New list</b> to pick the units for a game and print them with their stats, traits, relics and rules.</p>
        </Step>
      </Panel>

      <Panel id="guide.claim" domId="guide-claim" title="4 · Claim rewards from past battles">
        <p className="muted small" style={{ marginTop: 0 }}>
          When a game run in the battle tracker is finished, it's shared with the whole group. Each player then claims their own XP, RP and
          rewards from it, whenever they get to it.
        </p>
        <Step n={1} title="Open Past battles" where={<a href={href.tracker()}>Battle</a>}>
          <p>Scroll to the <b>Past battles</b> panel at the bottom of the Battle page.</p>
        </Step>
        <Step n={2} title="Show only the battles waiting on you">
          <p>
            Tick <b>Only waiting on me</b>. This hides everything except battles your forces played in and haven't claimed yet. The panel
            title shows how many there are.
          </p>
        </Step>
        <Step n={3} title="Claim the rewards">
          <p>
            Press <b>Claim rewards</b> next to your side. The post-battle wizard opens with the result, mission and units already filled in.
            Check them, record deaths, roll your rewards, and apply. The side then shows <span className="tag green">✓ claimed</span>.
          </p>
          <p className="small muted">
            If a side shows <b>Claim as…</b>, no force was loaded for it during the game. Pick the force you played with from the menu.
            Battles you've already claimed are listed in that force's <b>Battle log</b>.
          </p>
        </Step>
      </Panel>
    </>
  );
}

/** In-page jumps without touching the hash, which the router owns. */
function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.querySelector(e.currentTarget.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth' });
}
