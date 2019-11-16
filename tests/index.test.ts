import { Redis } from 'ioredis';
import { Leaderboard } from '../src/index';

let rc: Redis;

beforeAll(() => {
    rc = new (require('ioredis-mock'))();
});
beforeEach((done) => {
    rc.flushall(done);
});

describe('Basic leaderboard', () => {
    // +------+-------+------+------------------+
    // | name | score | rank | rank (lowToHigh) |
    // +------+-------+------+------------------+
    // | foo  | 15    | 1    | 3                |
    // +------+-------+------+------------------+
    // | bar  | 10    | 2    | 2                |
    // +------+-------+------+------------------+
    // | baz  | 5     | 3    | 1                |
    // +------+-------+------+------------------+
    const sampleData = async (lb: Leaderboard) => {
        await lb.set("foo", 15);
        await lb.set("bar", 10);
        await lb.set("baz", 5);
    };

    const checkScores = async (lb: Leaderboard) => {
        expect(await lb.score("foo")).toBe(15);
        expect(await lb.score("bar")).toBe(10);
        expect(await lb.score("baz")).toBe(5);
        expect(await lb.score("non-existing")).toBe(null);
    };

    const checkRemoval = async(lb: Leaderboard) => {
        await lb.set("removal", 42);
        expect(await lb.score("removal")).toBe(42);
        await lb.drop("removal");
        expect(await lb.score("removal")).toBe(null);
    };
    
    describe('high to low', () => {
        let lb: Leaderboard;

        beforeEach(async () => {
            lb = new Leaderboard(rc, { lowToHigh: false });
            await sampleData(lb);
        });

        test("check scores", async () => await checkScores(lb));
        test("check removal", async () => await checkRemoval(lb));

        test("check ranks", async () => {
            expect(await lb.rank("foo")).toBe(1);
            expect(await lb.rank("bar")).toBe(2);
            expect(await lb.rank("baz")).toBe(3);
            expect(await lb.rank("non-existing")).toBe(null);
        });
    });

    describe('low to high', () => {
        let lb: Leaderboard;

        beforeEach(async () => {
            lb = new Leaderboard(rc, { lowToHigh: true });
            await sampleData(lb);
        });

        test("check scores", async () => await checkScores(lb));
        test("check removal", async () => await checkRemoval(lb));

        test("check ranks", async () => {
            expect(await lb.rank("foo")).toBe(3);
            expect(await lb.rank("bar")).toBe(2);
            expect(await lb.rank("baz")).toBe(1);
            expect(await lb.rank("non-existing")).toBe(null);
        });
    });
});