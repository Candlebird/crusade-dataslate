import { describe, expect, it } from 'vitest';
import { creditsWhy } from './creditsWhy';

describe('creditsWhy', () => {
  it('says the cost and how far short when credits are short', () => {
    expect(creditsWhy('Not enough credits.', 40, 27.6)).toBe('Not enough credits: it costs 40, you have 27 (13 short).');
  });
  it('passes any other problem, or none, through', () => {
    expect(creditsWhy('The base is whole.', 40, 10)).toBe('The base is whole.');
    expect(creditsWhy(null, 40, 10)).toBeNull();
    expect(creditsWhy('Not enough credits.', null, 10)).toBe('Not enough credits.');
  });
});
