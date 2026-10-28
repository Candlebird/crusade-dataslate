import type { MouseEvent, ReactNode } from 'react';
import { href } from '../route';
import { Panel } from './ui';
import { Icon } from './Icon';

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
          New here? This guide turns your Army Forge list into a crusade force and shows how to claim battle rewards. First, press{' '}
          <b>Sign in</b> in the top bar and press <b>Request to join</b>. Once the GM accepts you, your forces and battles are shared
          with the group.
        </p>
        <nav className="guide-toc small">
          <a href="#guide-books" onClick={jump}>1 · Import an army book</a>
          <a href="#guide-force" onClick={jump}>2 · Import your force</a>
          <a href="#guide-edit" onClick={jump}>3 · Edit your force</a>
          <a href="#guide-claim" onClick={jump}>4 · Claim battle rewards</a>
        </nav>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Looking up a trait, relic, scar or requisition? The <a href={href.rules()}>Rules</a> page has every table, with a search box at the top.
        </p>
      </div>

      <Panel id="guide.books" domId="guide-books" title="1 · Import an army book">
        <p className="muted small" style={{ marginTop: 0 }}>
          Your faction's datasheets, rules and spells. The app needs it to build your units. One import by anyone covers the whole group.
        </p>
        <Step n={1} title="Copy the book's link from Army Forge" where="army-forge.onepagerules.com">
          <p>Open your army on Army Forge and use <b>Share</b>, or copy the address bar.</p>
        </Step>
        <Step n={2} title="Paste it on the Army Books page" where={<a href={href.books()}>Army Books</a>}>
          <p>
            Paste the link into <b>Add an army book</b> and press <b>Import</b>. It appears under <b>Imported books</b>. Press{' '}
            <b>Browse</b> to see its units, rules and spells.
          </p>
        </Step>
        <Step n={3} title="Keep it current">
          <p>
            When OPR updates the book, press <b>Refresh</b>. Your tags are kept. Also press <b>Fetch core rules</b> once, so printed
            lists explain rules like AP and Tough.
          </p>
          <p className="small muted">
            Import failing? The book may be private. Make it public or unlisted on Army Forge, or drop its JSON file under{' '}
            <b>Private book, or the fetch fails?</b>
          </p>
        </Step>
      </Panel>

      <Panel id="guide.import" domId="guide-force" title="2 · Import your force from Army Forge">
        <p className="muted small" style={{ marginTop: 0 }}>
          No need to re-enter your list. Importing creates a crusade force with every unit, upgrade and weapon filled in, plus a battle
          list ready to print.
        </p>
        <Step n={1} title="Export the list from Army Forge" where="army-forge.onepagerules.com">
          <p>
            Open your saved list's menu and <b>export</b> it. Army Forge saves a <code>.json</code> file.
          </p>
        </Step>
        <Step n={2} title="Drop the file on the Forces page" where={<a href={href.forces()}>Forces</a>}>
          <p>
            Under <b>Import</b>, drop the <code>.json</code> file on the box, or click the box to pick it. Your new force card appears.
          </p>
          <p className="small muted">
            Missing army book error? Do part 1 first. Mixed-army lists need every book they use.
          </p>
        </Step>
        <Step n={3} title="Upload it as yours">
          <p>
            A new import is only on your device. Press <b>Upload “…” as mine</b> at the top of the Forces page. The group can then see
            it, and only you can edit it.
          </p>
        </Step>
      </Panel>

      <Panel id="guide.edit" domId="guide-edit" title="3 · Edit your force">
        <p className="muted small" style={{ marginTop: 0 }}>Click a force card on <a href={href.forces()}>Forces</a> to open its Order of Battle.</p>
        <Step n={1} title="Force details" where="Right-hand panel">
          <p>
            Set the name, faction, player, starting supply, picture and lore. Changes save when you leave a field.
          </p>
        </Step>
        <Step n={2} title="Add units" where="+ Add unit">
          <p>
            <b>From army book</b> fills in stats and points from a datasheet and its upgrades. You can also paste list text or start
            blank. Tick <b>Only what I can afford</b> to hide units that don't fit your remaining Supply.
          </p>
        </Step>
        <Step n={3} title="Edit a unit" where="Click a unit row">
          <p>
            Give it a crusade name, adjust stats, and add XP, traits, relics and battle scars. Mark it <b>Comatose</b> or{' '}
            <b>Fallen</b> from the status menu. Fallen units are hidden unless you tick <b>Show … fallen</b>.
          </p>
        </Step>
        <Step n={4} title="Spend requisition" where="Requisition ledger">
          <p>
            <b>Requisition…</b> buys upgrades with RP; its <b>Increase Supply</b> trades 1 RP for more points. Every entry is logged, and
            you can edit or delete it.
          </p>
        </Step>
        <Step n={5} title="Build a battle list" where="Battle lists">
          <p>Press <b>+ New list</b>, pick units for a game, and print them with stats, traits, relics and rules.</p>
        </Step>
        <Step n={6} title="Play between games" where="Between games">
          <p>
            Under the force's stats: <b>Solo patrol</b>, the <b>Training sim</b> and <b>Sortie</b>, plus <b>Expedition</b> and{' '}
            <b>Unit task</b> in a Nexus War. A greyed-out button says why it can't start yet.
          </p>
        </Step>
        <Step n={7} title="Check what's waiting on you" where="Top of the force page">
          <p>Units with upgrades to pick and round income ready to claim show in a <b>Waiting on you</b> box at the top.</p>
        </Step>
      </Panel>

      <Panel id="guide.claim" domId="guide-claim" title="4 · Claim rewards from past battles">
        <p className="muted small" style={{ marginTop: 0 }}>
          Finished tracker games are shared with the group. Each player claims their own XP, RP and rewards whenever they like.
        </p>
        <p className="muted small">
          No time to play? Press <b><Icon name="g:power-lightning" /> Auto-battle</b> on a running battle. Each player picks their
          force, or the AI generates one. Each unit's Attack and Defense come from its Quality, Defense, weapons, traits, upgrades,
          relics, scars and level. Units trade attacks for 4 rounds. Most points destroyed wins; a close result is a draw. A unit at
          half strength, or beaten in melee, tests Morale and may be Shaken, losing its next turn. Nexus sector fights add the sector's
          modifiers, plus any Ion Storm that round. Apply and claim it like any battle: losses and kill XP carry over.
        </p>
        <p className="muted small">
          Once the GM switches on zone battles, the button reads <b><Icon name="g:crossed-swords" /> Zone battle</b> instead: the battle is
          played out on a board of 12" zones, either in <b>Command</b> (you order your side, for ¾ of the XP and the reward rolls) or
          <b> Quick</b> (the AI plays both, for half the XP). It's saved after every step, so you can close it and pick it up later.
          The Voidspawn, the Echo Lord, home challenges and battles between players stay at the table.
        </p>
        <Step n={1} title="Open Past battles" where={<a href={href.tracker()}>Battle</a>}>
          <p>The <b>Past battles</b> panel is at the bottom of the Battle page.</p>
        </Step>
        <Step n={2} title="Show only the battles waiting on you">
          <p>
            Tick <b>Only waiting on me</b> to see only battles your forces haven't claimed yet. The panel title shows the count.
          </p>
        </Step>
        <Step n={3} title="Claim the rewards">
          <p>
            Press <b>Claim rewards</b> next to your side. The post-battle wizard opens with the result, mission and units filled in.
            Check them, record deaths, roll rewards, and apply. Your side then shows <span className="tag green"><Icon name="l:check" /> claimed</span>.
          </p>
          <p className="small muted">
            See <b>Claim as…</b>? No force was loaded for that side, so pick the force you played. Claimed battles are listed in the
            force's <b>Battle log</b>.
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
