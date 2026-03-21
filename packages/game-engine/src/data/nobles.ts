import { type Noble } from '../types.js';

export const NOBLES: readonly Noble[] = [
  {
    id: 'noble-1',
    points: 3,
    requirement: { white: 4, blue: 4, green: 0, red: 0, black: 0 },
  },
  {
    id: 'noble-2',
    points: 3,
    requirement: { white: 4, blue: 0, green: 4, red: 0, black: 0 },
  },
  {
    id: 'noble-3',
    points: 3,
    requirement: { white: 0, blue: 0, green: 4, red: 4, black: 0 },
  },
  {
    id: 'noble-4',
    points: 3,
    requirement: { white: 0, blue: 0, green: 0, red: 4, black: 4 },
  },
  {
    id: 'noble-5',
    points: 3,
    requirement: { white: 3, blue: 3, green: 3, red: 0, black: 0 },
  },
  {
    id: 'noble-6',
    points: 3,
    requirement: { white: 4, blue: 0, green: 0, red: 0, black: 4 },
  },
  {
    id: 'noble-7',
    points: 3,
    requirement: { white: 0, blue: 3, green: 3, red: 3, black: 0 },
  },
  {
    id: 'noble-8',
    points: 3,
    requirement: { white: 0, blue: 0, green: 3, red: 3, black: 3 },
  },
  {
    id: 'noble-9',
    points: 3,
    requirement: { white: 3, blue: 0, green: 0, red: 3, black: 3 },
  },
  {
    id: 'noble-10',
    points: 3,
    requirement: { white: 3, blue: 3, green: 0, red: 0, black: 3 },
  },
];

export const NOBLES_BY_ID = new Map(NOBLES.map((noble) => [noble.id, noble]));
