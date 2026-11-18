import { describe, it, expect } from 'vitest';
import { waterFor } from './water';
describe('water meter', () => {
  it('25 ml per message', () => expect(waterFor(40).ml).toBe(1000));
  it('3 messages is drops', () => expect(waterFor(3).level.label).toBe('Algumas gotas'));
  it('800 messages is a 20L galão', () => expect(waterFor(799).level.label).toBe('Um galão de 20L'));
});
