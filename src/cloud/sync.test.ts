import { describe, expect, it } from 'vitest';
import { SyncEngine, type LocalDoc, type RemoteDoc, type SyncHost } from './sync';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(known: string[] = [], now = () => 0) {
  const log: string[] = [];
  const saved: string[][] = [];
  let fail = false;
  const host: SyncHost = {
    push: async (d) => {
      log.push(`push ${d.path} ${d.json}`);
      if (fail) throw new Error('denied');
    },
    remove: async (p) => void log.push(`remove ${p}`),
    apply: async (p, j) => void log.push(`apply ${p} ${j}`),
    canDelete: (r) => r.owner === 'me',
    readOnly: (p) => void log.push(`readonly ${p}`),
    failed: (p) => void log.push(`failed ${p}`),
    saveKnown: (p) => void saved.push(p),
  };
  const engine = new SyncEngine(host, new Set(known), now);
  return { engine, log, saved, failNext: () => (fail = true), succeed: () => (fail = false) };
}

const L = (id: string, json: string, updatedAt = '2026-01-01', canWrite = true): LocalDoc => ({ path: `forces/${id}`, json, updatedAt, canWrite });
const R = (id: string, json: string, updatedAt = '2026-01-01', owner = 'me'): RemoteDoc => ({ path: `forces/${id}`, json, updatedAt, owner, confirmed: true });

describe('SyncEngine', () => {
  it('waits for the first server snapshot', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [], true);
    expect(log).toEqual([]);
    engine.setRemote('forces', [], false);
    expect(log).toEqual(['push forces/a 1']);
  });

  it('pushes local edits once, and not again while the write is in flight', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setLocal([L('a', '2')]);
    engine.setLocal([L('a', '2')]);
    engine.setRemote('forces', [R('a', '2')], false);
    expect(log).toEqual(['push forces/a 2']);
  });

  it('applies remote edits, and waits for them to land before pushing again', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setRemote('forces', [R('a', '2')], false);
    engine.setLocal([L('a', '1')]);
    engine.setLocal([L('a', '2')]);
    expect(log).toEqual(['apply forces/a 2']);
  });

  it('on first sight of a conflict, the newer side wins', () => {
    const a = setup();
    a.engine.setLocal([L('a', 'mine', '2026-02-01')]);
    a.engine.setRemote('forces', [R('a', 'theirs', '2026-01-01')], false);
    expect(a.log).toEqual(['push forces/a mine']);
    const b = setup();
    b.engine.setLocal([L('a', 'mine', '2026-01-01')]);
    b.engine.setRemote('forces', [R('a', 'theirs', '2026-02-01')], false);
    expect(b.log).toEqual(['apply forces/a theirs']);
  });

  it('takes back a force handed to another player without undoing anything', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', 'mine')]);
    engine.setRemote('forces', [R('a', 'mine')], false);
    engine.setRemote('forces', [R('a', 'given', '2026-02-01', 'other')], false);
    engine.setLocal([L('a', 'given', '2026-02-01', false)]);
    engine.setLocal([L('a', 'given', '2026-02-01', false)]);
    expect(log).toEqual(['apply forces/a given']);
  });

  it('undoes edits to things this user cannot change', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1', '', false)]);
    engine.setRemote('forces', [R('a', '1', '', 'other')], false);
    engine.setLocal([L('a', 'hacked', '', false)]);
    expect(log).toEqual(['readonly forces/a', 'apply forces/a 1']);
  });

  it('deletes remotely what was deleted locally, if allowed', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1'), L('b', '1', '', false)]);
    engine.setRemote('forces', [R('a', '1'), R('b', '1', '', 'other')], false);
    engine.setLocal([]);
    expect(log).toEqual(['remove forces/a', 'readonly forces/b', 'apply forces/b 1']);
  });

  it('deletes locally what was deleted remotely, even between visits', () => {
    const { engine, log } = setup(['forces/a']);
    engine.setLocal([L('a', '1'), L('new', '1')]);
    engine.setRemote('forces', [], false);
    expect(log).toEqual(['apply forces/a null', 'push forces/new 1']);
  });

  it('reverts to the server copy when a write is refused, without retrying', async () => {
    const { engine, log, failNext } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    failNext();
    engine.setLocal([L('a', '2', '2026-09-09')]);
    await flush();
    expect(log).toEqual(['push forces/a 2', 'failed forces/a', 'apply forces/a 1']);
  });

  it('uses cached snapshots once the server has answered', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setRemote('forces', [R('a', '2')], true);
    expect(log).toEqual(['apply forces/a 2']);
  });

  it('keeps each collection waiting for its own first server snapshot', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1'), { path: 'campaign/current', json: 'c', updatedAt: '', canWrite: true }]);
    engine.setRemote('forces', [], false);
    expect(log).toEqual(['push forces/a 1']);
    engine.setRemote('campaign', [], false);
    expect(log).toEqual(['push forces/a 1', 'push campaign/current c']);
  });

  it('remembers only confirmed documents, to spot deletions on the next visit', () => {
    const { engine, saved } = setup();
    engine.setRemote('forces', [R('a', '1'), { ...R('b', '1'), confirmed: false }], false);
    expect(saved).toEqual([['forces/a']]);
    // Nothing new: not saved again.
    engine.setRemote('forces', [R('a', '1')], false);
    expect(saved.length).toBe(1);
  });

  it('on first sight of a conflict with the same updatedAt, the server copy wins', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', 'mine', '2026-02-01')]);
    engine.setRemote('forces', [R('a', 'theirs', '2026-02-01')], false);
    expect(log).toEqual(['apply forces/a theirs']);
  });

  it('never pushes over the server copy something this user cannot write, even if newer', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', 'mine', '2026-09-01', false)]);
    engine.setRemote('forces', [R('a', 'theirs', '2026-01-01', 'other')], false);
    expect(log).toEqual(['apply forces/a theirs']);
  });

  it('does not push what this user cannot write when it is missing from the server', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1', '', false)]);
    engine.setRemote('forces', [], false);
    expect(log).toEqual([]);
  });

  it('after an applied remote change lands, waits a grace period for the local copy to catch up', async () => {
    let t = 0;
    const { engine, log } = setup([], () => t);
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setRemote('forces', [R('a', '2')], false);
    await flush();
    // The local state hasn't picked the change up yet: don't push the stale copy back.
    t = 2000;
    engine.setLocal([L('a', '1')]);
    expect(log).toEqual(['apply forces/a 2']);
    // Past the grace period the local copy counts as a new edit again.
    t = 4000;
    engine.setLocal([L('a', '1', '2026-05-05')]);
    expect(log).toEqual(['apply forces/a 2', 'push forces/a 1']);
  });

  it('lets a later edit through after a refused write', async () => {
    const { engine, log, failNext, succeed } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    failNext();
    engine.setLocal([L('a', '2', '2026-09-09')]);
    await flush();
    succeed();
    log.length = 0;
    // The server copy was applied locally; then the user edits again.
    engine.setLocal([L('a', '1')]);
    engine.setLocal([L('a', '3', '2026-09-10')]);
    expect(log).toEqual(['push forces/a 3']);
  });

  it('puts a document back when its deletion is refused', async () => {
    const log: string[] = [];
    const engine = new SyncEngine(
      {
        push: async () => {},
        remove: async (p) => {
          log.push(`remove ${p}`);
          throw new Error('denied');
        },
        apply: async (p, j) => void log.push(`apply ${p} ${j}`),
        canDelete: () => true,
        readOnly: () => {},
        failed: (p) => void log.push(`failed ${p}`),
        saveKnown: () => {},
      },
      new Set(),
    );
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setLocal([]);
    await flush();
    expect(log).toEqual(['remove forces/a', 'failed forces/a', 'apply forces/a 1']);
  });

  it('takes a third party edit that lands while our write is in flight', () => {
    const { engine, log } = setup();
    engine.setLocal([L('a', '1')]);
    engine.setRemote('forces', [R('a', '1')], false);
    engine.setLocal([L('a', '2')]);
    engine.setRemote('forces', [R('a', 'other')], false);
    expect(log).toEqual(['push forces/a 2', 'apply forces/a other']);
  });

  it('deletes a new document deleted before the server showed it, instead of bringing it back', () => {
    const { engine, log } = setup();
    engine.setRemote('forces', [], false);
    engine.setLocal([L('a', '1')]);
    engine.setLocal([]);
    expect(log).toEqual(['push forces/a 1', 'remove forces/a']);
    // The snapshots that follow (the write, then the delete) change nothing.
    engine.setRemote('forces', [{ ...R('a', '1'), confirmed: false }], false);
    engine.setRemote('forces', [], false);
    expect(log).toEqual(['push forces/a 1', 'remove forces/a']);
  });
});
