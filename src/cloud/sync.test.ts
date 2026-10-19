import { describe, expect, it } from 'vitest';
import { SyncEngine, type LocalDoc, type RemoteDoc, type SyncHost } from './sync';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(known: string[] = []) {
  const log: string[] = [];
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
    saveKnown: () => {},
  };
  const engine = new SyncEngine(host, new Set(known));
  return { engine, log, failNext: () => (fail = true) };
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
});
