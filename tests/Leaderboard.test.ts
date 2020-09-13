import {
    Leaderboard,
    SortPolicy,
    UpdatePolicy,
    Score,
    Rank,
    EntryUpdateQuery
} from '../src/index';
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
    
    describe('clear', () => {
        beforeEach(() => {
            lb = new Leaderboard(rc, {
                redisKey: TEST_KEY,
                sortPolicy: 'high-to-low', // not relevant
                updatePolicy: 'best', // not relevant
            });
        });

        test('clearing', async () => {
            expect(await lb.count()).toBe(0);
            await lb.update(FOO_BAR_BAZ);
            expect(await lb.count()).toBe(FOO_BAR_BAZ.length);
            await lb.clear();
            expect(await lb.count()).toBe(0);
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
            
            test('score null', async () => {
                expect(await lb.score("fail")).toBe(null);
            });
            
            test('rank null', async () => {
                expect(await lb.rank("fail")).toBe(null);
            });
            
            test('find null', async () => {
                expect(await lb.find("fail")).toBe(null);
            });
        });
    });
    
    describe('update', () => {
        describe.each([
            ['high-to-low', 'best',      (a: Score, b: Score): Score => Math.max(a, b)],
            ['high-to-low', 'aggregate', (a: Score, b: Score): Score => a + b],
            ['high-to-low', 'replace',   (a: Score, b: Score): Score => b],
            ['low-to-high', 'best',      (a: Score, b: Score): Score => Math.min(a, b)],
            ['low-to-high', 'aggregate', (a: Score, b: Score): Score => a + b],
            ['low-to-high', 'replace',   (a: Score, b: Score): Score => b]
        ])('%s / %s', (sortPolicy, updatePolicy, expectedBehaviour) => {
            beforeEach(() => {
                lb = new Leaderboard(rc, {
                    redisKey: TEST_KEY,
                    sortPolicy: sortPolicy as SortPolicy,
                    updatePolicy: updatePolicy as UpdatePolicy,
                });
            });

            test('add new', async () => {
                await lb.update({ id: "foo", value: 10 });
                expect(await lb.count()).toBe(1);
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
                        // set initial value
                        await lb.replace("foo", a);
                    });
                    
                    // should ignore whatever policy is set, always replace
                    test('replace', async () => {
                        await lb.replace("foo", b);
                        expect(await lb.score("foo")).toBe(b);
                    });
                    test('incr', async () => {
                        await lb.incr("foo", b);
                        expect(await lb.score("foo")).toBe(a + b);
                    });
                    test('best', async () => {
                        await lb.best("foo", b);
                        expect(await lb.score("foo")).toBe(
                            sortPolicy === 'high-to-low' ?
                            Math.max(a, b) : Math.min(a, b)
                        );
                    });


                    test('update', async () => {
                        await lb.update({ id: "foo", value: b });
                        expect(await lb.score("foo")).toBe(expectedScore);
                    });
                });
            });
        });
    });
});
