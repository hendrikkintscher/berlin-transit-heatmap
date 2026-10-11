import { describe, expect, it } from 'vitest';
import { buildWalkGraph, encodeWalkGraph, isWalkable, WalkDistances } from '../src/walk.ts';

const tags = (o: Record<string, string>) => new Map(Object.entries(o));

describe('isWalkable', () => {
  it('keeps streets, paths and platforms', () => {
    expect(isWalkable(tags({ highway: 'residential' }))).toBe(true);
    expect(isWalkable(tags({ highway: 'footway', footway: 'sidewalk' }))).toBe(true);
    expect(isWalkable(tags({ highway: 'steps' }))).toBe(true);
    expect(isWalkable(tags({ railway: 'platform' }))).toBe(true);
    expect(isWalkable(tags({ highway: 'primary', foot: 'use_sidepath' }))).toBe(true);
  });

  it('drops motorways, private ways and dead-end service roads', () => {
    expect(isWalkable(tags({ highway: 'motorway' }))).toBe(false);
    expect(isWalkable(tags({ highway: 'trunk', motorroad: 'yes' }))).toBe(false);
    expect(isWalkable(tags({ highway: 'path', foot: 'no' }))).toBe(false);
    expect(isWalkable(tags({ highway: 'service', access: 'private' }))).toBe(false);
    expect(isWalkable(tags({ highway: 'service', access: 'private', foot: 'yes' }))).toBe(true);
    expect(isWalkable(tags({ highway: 'service', service: 'driveway' }))).toBe(false);
    expect(isWalkable(tags({ highway: 'construction' }))).toBe(false);
    expect(isWalkable(tags({ railway: 'rail' }))).toBe(false);
  });
});

// A street of five nodes 50 m apart (about 0.000733° of longitude), a side path off its
// middle, a short stub, and a separate island that is dropped.
const D = 0.000733;
const opl = [
  ...[0, 1, 2, 3, 4].map((i) => `n${i + 1} x${13.4 + i * D} y52.5`),
  'n10 x13.4014660 y52.5009',
  'n11 x13.4014660 y52.50081',
  'n20 x13.5 y52.6',
  'n21 x13.501 y52.6',
  'w1 Thighway=residential,name=Teststra%df%e Nn1,n2,n3,n4,n5',
  'w2 Thighway=footway Nn3,n10',
  'w3 Thighway=footway Nn10,n11',
  'w4 Thighway=motorway Nn1,n5',
  'w5 Thighway=path Nn20,n21',
];

describe('buildWalkGraph', () => {
  it('keeps junctions, thins chains and keeps the largest piece', async () => {
    const { graph, stats } = await buildWalkGraph(opl);
    expect(stats.osmWays).toBe(5);
    expect(stats.keptWays).toBe(4);
    // Street ends, the junction at n3 and the side path's end; the 11 m stub and the island are gone.
    expect(graph.lat.length).toBe(4);
    expect(graph.edgeA.length).toBe(3);
    const total = graph.edgeM.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(290);
    expect(total).toBeLessThan(300);
  });

  it('encodes to walk.bin', async () => {
    const { graph } = await buildWalkGraph(opl);
    const bin = encodeWalkGraph(graph);
    expect([...bin.subarray(0, 5)]).toEqual([0x42, 0x54, 0x48, 0x57, 1]);
    expect(bin[5]).toBe(4); // nodes
    expect(bin[6]).toBe(3); // edges
  });

  it('measures walking distances for transfers', async () => {
    const { graph } = await buildWalkGraph(opl);
    const walk = new WalkDistances(graph);
    const west = walk.snap(52.5001, 13.4, 50)!;
    const east = walk.snap(52.5001, 13.4 + 4 * D, 50)!;
    const path = walk.snap(52.5009, 13.401466, 50)!;
    expect(walk.snap(52.52, 13.4, 50)).toBeNull();
    const [toEast, toPath] = walk.distances(west, [east, path], 1000);
    expect(toEast).toBeGreaterThan(215);
    expect(toEast).toBeLessThan(230);
    expect(toPath).toBeGreaterThan(200);
    expect(toPath).toBeLessThan(220);
    expect(walk.distances(west, [east], 100)[0]).toBe(Infinity);
  });
});
