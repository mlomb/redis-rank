import {
    Leaderboard,
    SortPolicy,
    UpdatePolicy,
    Score,
    EntryUpdateQuery
} from '../lib/index';
import rc from './redis';

const TEST_KEY = "lb";

// +-----+-------+--------+--------+
// | id  | score | rank ↓ | rank ↑ |
// +-----+-------+--------+--------+
// | foo | 10    | 3      | 1      |
// +-----+-------+--------+--------+
// | bar | 100   | 2      | 2      |
// +-----+-------+--------+--------+
// | baz | 1000  | 1      | 3      |
// +-----+-------+--------+--------+
const FOO_BAR_BAZ: EntryUpdateQuery[] = [
    { id: "foo", value: 10 },
    { id: "bar", value: 100 },
    { id: "baz", value: 1000 },
];

describe('Leaderboard', () => {
    let lb: Leaderboard;

    describe('count', () => {
        beforeEach(() => {
            lb = new Leaderboard(rc, {
                redisKey: TEST_KEY,
                sortPolicy: 'high-to-low', // not relevant
                updatePolicy: 'best', // not relevant
            });
        });

        test('new leaderboard should be empty', async () => {
            expect(await lb.count()).toBe(0);
        });
        
        test('correct count', async () => {
            await lb.update(FOO_BAR_BAZ);
            expect(await lb.count()).toBe(FOO_BAR_BAZ.length);
        });
    });
    
    describe('remove', () => {
        beforeEach(() => {
            lb = new Leaderboard(rc, {
                redisKey: TEST_KEY,
                sortPolicy: 'high-to-low', // not relevant
                updatePolicy: 'best', // not relevant
            });
        });

        test('clear', async () => {
            expect(await lb.count()).toBe(0);
            await lb.update(FOO_BAR_BAZ);
            expect(await lb.count()).toBe(FOO_BAR_BAZ.length);
            await lb.clear();
            expect(await lb.count()).toBe(0);
        });

        test('remove single', async () => {
            expect(await lb.count()).toBe(0);
            await lb.update(FOO_BAR_BAZ);
            expect(await lb.count()).toBe(3);
            await lb.remove("foo");
            expect(await lb.count()).toBe(2);
        });

        test('remove multi', async () => {
            expect(await lb.count()).toBe(0);
            await lb.update(FOO_BAR_BAZ);
            expect(await lb.count()).toBe(3);
            await lb.remove(["foo", "baz"]);
            expect(await lb.count()).toBe(1);
        });
    });

    describe('simple query', () => {
        describe.each([
            ['high-to-low', 3, 2, 1],
            ['low-to-high', 1, 2, 3]
        ])('%s', (sortPolicy, fooRank, barRank, bazRank) => {
            beforeEach(async () => {
                lb = new Leaderboard(rc, {
                    redisKey: TEST_KEY,
                    sortPolicy: sortPolicy as SortPolicy,
                    updatePolicy: 'best', // not relevant
                });
                await lb.update(FOO_BAR_BAZ);
            });
    
            test('score', async () => {
                expect(await lb.score("foo")).toBe(10);
                expect(await lb.score("bar")).toBe(100);
                expect(await lb.score("baz")).toBe(1000);
            });

            test('rank', async () => {
                expect(await lb.rank("foo")).toBe(fooRank);
                expect(await lb.rank("bar")).toBe(barRank);
                expect(await lb.rank("baz")).toBe(bazRank);
            });

            test('find', async () => {
                expect(await lb.find("foo")).toMatchObject({ id: "foo", score: 10, rank: fooRank });
                expect(await lb.find("bar")).toMatchObject({ id: "bar", score: 100, rank: barRank });
                expect(await lb.find("baz")).toMatchObject({ id: "baz", score: 1000, rank: bazRank });
            });
            
            test('at', async () => {
                expect(await lb.at(fooRank)).toMatchObject({ id: "foo", score: 10, rank: fooRank });
                expect(await lb.at(barRank)).toMatchObject({ id: "bar", score: 100, rank: barRank });
                expect(await lb.at(bazRank)).toMatchObject({ id: "baz", score: 1000, rank: bazRank });
            });

            test('score null', async () => {
                expect(await lb.score("fail")).toBe(null);
            });
            
            test('rank null', async () => {
                expect(await lb.rank("fail")).toBe(null);
            });
            
            test('find null', async () => {
                expect(await lb.find("fail")).toBe(null);
            });

            test('at null', async () => {
                expect(await lb.at(-100)).toBe(null);
                expect(await lb.at(100000)).toBe(null);
            });

            test('bottom crash', async () => {
                expect(lb.bottom(0)).rejects.toThrow();
                expect(lb.bottom(-1)).rejects.toThrow();
            });
            
            test('list crash', async () => {
                expect(lb.list(0, 5)).rejects.toThrow(); // low < 1
                expect(lb.list(5, 0)).rejects.toThrow(); // high < 1
                expect(lb.list(10, 5)).rejects.toThrow(); // low > high
            });

            test('around invalid distance', async () => {
                expect(lb.around("foo", -1)).rejects.toThrow();
            });
        });
    });
    
    describe('combinations', () => {
        describe.each([
            ['high-to-low', 'best',      true,  (a: Score, b: Score): Score => Math.max(a, b)],
            ['high-to-low', 'aggregate', true,  (a: Score, b: Score): Score => a + b],
            ['high-to-low', 'replace',   false, (a: Score, b: Score): Score => b],
            ['low-to-high', 'best',      true,  (a: Score, b: Score): Score => Math.min(a, b)],
            ['low-to-high', 'aggregate', true,  (a: Score, b: Score): Score => a + b],
            ['low-to-high', 'replace',   false, (a: Score, b: Score): Score => b]
        ])('%s / %s', (sortPolicy, updatePolicy, shouldReturnFinalScore, expectedBehaviour) => {
            beforeEach(() => {
                lb = new Leaderboard(rc, {
                    redisKey: TEST_KEY,
                    sortPolicy: sortPolicy as SortPolicy,
                    updatePolicy: updatePolicy as UpdatePolicy,
                });
            });

            test('getters', () => {
                expect(lb.redisClient).toBe(rc);
                expect(lb.redisKey).toBe(TEST_KEY);
                expect(lb.sortPolicy).toBe(sortPolicy);
                expect(lb.updatePolicy).toBe(updatePolicy);
            });

            test('updateOne new', async () => {
                let r = await lb.updateOne("foo", 10);
                expect(await lb.count()).toBe(1);
                expect(await lb.score("foo")).toBe(10);
            });
            
            test('update single new', async () => {
                let r = await lb.update({ id: "foo", value: 10 });
                expect(await lb.count()).toBe(1);
                expect(await lb.score("foo")).toBe(10);
            });

            test('update list new', async () => {
                let r = await lb.update(FOO_BAR_BAZ);
                expect(await lb.count()).toBe(FOO_BAR_BAZ.length);
                for(let e of FOO_BAR_BAZ)
                    expect(await lb.score(e.id)).toBe(e.value);
            });

            describe('update override', () => {
                beforeEach(async () => {
                    await lb.update(FOO_BAR_BAZ); // (non existant, will create)
                });

                // now test overrides
                test('replace override', async () => {
                    await lb.updateOne("foo", 6969, 'replace');
                    expect(await lb.score("foo")).toBe(6969);
                });
                test('aggregate override', async () => {
                    expect(await lb.updateOne("foo", 6969, 'aggregate')).toBe(10 + 6969);
                });
                test('best override', async () => {
                    expect(await lb.updateOne("foo", 6969, 'best')).toBe(sortPolicy === 'high-to-low' ? 6969 : 10);
                });
            });
            
            if(shouldReturnFinalScore) {
                test('updateOne return score', async () => {
                    expect(await lb.updateOne("foo", 10)).toBe(10);
                });
                
                test('update single return score', async () => {
                    expect(await lb.update({ id: "foo", value: 10 })).toStrictEqual([10]);
                });

                test('update list return score', async () => {
                    expect(await lb.update(FOO_BAR_BAZ)).toStrictEqual([10, 100, 1000]);
                });
            }
            
            describe.each([
                0, 1, 2, 5, 8, 10
            ])('queries with %i entrie(s)', (total) => {
                beforeEach(async () => {
                    for(let i = 0; i < total; i++) {
                        await lb.updateOne(`n${i}`, (sortPolicy === 'high-to-low' ? -1 : 1) * 10 * (i + 1));
                    }
                });

                test.each([
                    1, 2, 6, 10
                ])('top %i', async (top) => {
                    let r = top === 10 ? await lb.top() : await lb.top(top);
                    expect(r.length).toBe(Math.min(top, total));
                    for(let i = 0; i < r.length; i++)
                        expect(r[i].id).toBe(`n${i}`);
                });
                test.each([
                    1, 2, 6, 10
                ])('bottom %i', async (bottom) => {
                    let r = bottom === 10 ? await lb.bottom() : await lb.bottom(bottom);
                    expect(r.length).toBe(Math.min(bottom, total));
                    for(let i = 0; i < r.length; i++) {
                        expect(r[i].rank === total - i);
                        expect(r[i].id).toBe(`n${total-i-1}`);
                    }
                });
                
                test.each([
                    [0, Math.min(total-1, 5), false],
                    [1, Math.min(total-1, 5), false],
                    [2, Math.min(total-1, 5), false],
                    [4, Math.min(total-1, 3), false],
                    [7, Math.min(total-1, 9), false],
                    [3, Math.min(total-1, 7), false],

                    [0, Math.min(total-1, 5), true],
                    [1, Math.min(total-1, 5), true],
                    [2, Math.min(total-1, 5), true],
                    [4, Math.min(total-1, 3), true],
                    [7, Math.min(total-1, 9), true],
                    [3, Math.min(total-1, 7), true]
                ])('around d=%i e=n%i fill=%s', async (distance, entry, fill) => {
                    let id = `n${entry}`;
                    let r = await lb.around(id, distance, fill);
                    if(fill) {
                        expect(r.length).toBe(Math.min(total, 2*distance+1));
                    } else {
                        expect(r.length).toBe(Math.min(total, Math.min(
                            Math.min(entry, distance)+1+distance, // left
                            distance+1+(total-1-entry) // right
                        )));
                    }
                    if(r.length > 0) {
                        // check that the ranks are increasing
                        for(let i = 1; i < r.length; i++)
                            expect(r[i].rank).toBeGreaterThan(r[i-1].rank);
                        // check that the entry queried is in the result
                        expect(r.map(x => x.id)).toContain(id);
                        // we could make more tests, but meh
                    }
                });
            });

            describe.each([
                [ 1,  1],
                [ 1, -1],
                [-1,  1],
                [-1, -1],
            ])('%i / %i', (signA, signB) => {
                describe.each([
                    // integers
                    [signA * 10, signB * 20],
                    [signA * 20, signB * 10],
                    // floats
                    [signA * 15.5, signB * 25.5],
                    [signA * 25.5, signB * 15.5]
                ])('from %i to %i', (a, b) => {
                    const expectedScore = expectedBehaviour(a, b);

                    beforeEach(async () => {
                        // set initial values
                        for(let e of FOO_BAR_BAZ)
                            await lb.updateOne(e.id, a);
                    });
                    
                    test('updateOne existing', async () => {
                        await lb.updateOne("foo", b);
                        expect(await lb.score("foo")).toBe(expectedScore);
                    });
                    test('update single existing', async () => {
                        await lb.update({ id: "foo", value: b });
                        expect(await lb.score("foo")).toBe(expectedScore);
                    });
                    test('update list existing', async () => {
                        let list = [];
                        for(let e of FOO_BAR_BAZ)
                            list.push({ id: e.id, value: b });
                        await lb.update(list);
                        for(let e of FOO_BAR_BAZ)
                            expect(await lb.score(e.id)).toBe(expectedScore);
                    });
                });
            });
        });
    });
    
    describe('keep top N', () => {
        describe.each([
            'high-to-low',
            'low-to-high'
        ])('%s', (sortPolicy) => {
            beforeEach(async () => {
                lb = new Leaderboard(rc, {
                    redisKey: TEST_KEY,
                    sortPolicy: sortPolicy as SortPolicy,
                    updatePolicy: 'replace',
                    limitTopN: 3
                });
                for(let k = 0; k < 10; k++) { // repeat a few times
                    for(let i = 0; i < 10; i++) {
                        await lb.updateOne(`n${i}`, (sortPolicy === 'high-to-low' ? -1 : 1) * 10 * (i + 1));
                    }
                }
            });

            test('top 3', async () => {
                let r = await lb.top(20);
                expect(r.length).toBe(3);
                let id = 0;
                for(let e of r)
                    expect(e.id).toBe(`n${id++}`);
            });
        })
    });
});
