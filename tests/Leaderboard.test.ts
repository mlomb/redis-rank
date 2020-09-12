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
const FOO_BAR_BAZ: EntryUpdateQuery[] = [
    { id: "foo", value: 1 },
    { id: "bar", value: 3 },
    { id: "baz", value: 2 },
];

describe('Leaderboard', () => {
    let lb: Leaderboard;

    describe('count', () => {
        beforeEach(async () => {
            lb = new Leaderboard(rc, {
                redisKey: TEST_KEY,
                sortPolicy: 'high-to-low',
                updatePolicy: 'best',
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
        beforeEach(async () => {
            lb = new Leaderboard(rc, {
                redisKey: TEST_KEY,
                sortPolicy: 'high-to-low',
                updatePolicy: 'best',
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

    describe('update', () => {
        describe.each([
            ['high-to-low', 'best',      (a: Score, b: Score): Score => Math.max(a, b)],
            ['high-to-low', 'aggregate', (a: Score, b: Score): Score => a + b],
            ['high-to-low', 'replace',   (a: Score, b: Score): Score => b],
            ['low-to-high', 'best',      (a: Score, b: Score): Score => Math.min(a, b)],
            ['low-to-high', 'aggregate', (a: Score, b: Score): Score => a + b],
            ['low-to-high', 'replace',   (a: Score, b: Score): Score => b]
        ])('%s / %s', (sortPolicy, updatePolicy, expectedBehaviour) => {
            beforeEach(async () => {
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
                test.each([
                    // integers
                    [signA * 10, signB * 20],
                    [signA * 20, signB * 10],
                    // floats
                    [signA * 15.5, signB * 25.5],
                    [signA * 25.5, signB * 15.5]
                ])('from %i to %i', async (a, b) => {
                    // make sure it doesn't exists
                    expect(await lb.score("foo")).toBe(null);
                    await lb.update({ id: "foo", value: a });
                    await lb.update({ id: "foo", value: b });
                    expect(await lb.score("foo")).toBe(expectedBehaviour(a, b));
                });
            });
        });
    });
});
