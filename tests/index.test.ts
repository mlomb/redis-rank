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
    let lb: Leaderboard;


    // +------+-------+------+------------------+
    // | name | score | rank | rank (lowToHigh) |
    // +------+-------+------+------------------+
    // | foo  | 15    | 1    | 3                |
    // +------+-------+------+------------------+
    // | bar  | 10    | 2    | 2                |
    // +------+-------+------+------------------+
    // | baz  | 5     | 3    | 1                |
    // +------+-------+------+------------------+
    const sampleData = async () => {
        await lb.set("foo", 15);
        await lb.set("bar", 10);
        await lb.set("baz", 5);
    };

    const checkCommon = () => {
        test("check scores", async () => {
            expect(await lb.score("foo")).toBe(15);
            expect(await lb.score("bar")).toBe(10);
            expect(await lb.score("baz")).toBe(5);
            expect(await lb.score("non-existing")).toBe(null);
        });
        test("check removal", async () => {
            await lb.set("removal", 42);
            expect(await lb.score("removal")).toBe(42);
            await lb.drop("removal");
            expect(await lb.score("removal")).toBe(null);
        });
        test("check list lengths", async () => {
            expect(await lb.list(1, 1)).toHaveLength(1);
            expect(await lb.list(1, 2)).toHaveLength(2);
            expect(await lb.list(1, 3)).toHaveLength(3);
            expect(await lb.list(2, 3)).toHaveLength(2);
            expect(await lb.list(1, 100)).toHaveLength(3);
            expect(await lb.list(2, 100)).toHaveLength(2);
            expect(await lb.list(3, 100)).toHaveLength(1);
            expect(await lb.list(4, 100)).toHaveLength(0);
            expect(await lb.list(50, 55)).toHaveLength(0);
        });
        test("check list errors", async () => {
            await expect(lb.list(0, 5)).rejects.toThrow('Out of bounds');
            await expect(lb.list(-5, 0)).rejects.toThrow('Out of bounds');
            await expect(lb.list(10, 5)).rejects.toThrow('high must be greater than low');
        });
        test("incr", async () => {
            expect(await lb.incr("bar", 30)).toBe(40); // existing
            expect(await lb.incr("foobar", 20)).toBe(20); // new
        });
    }
    
    describe('high to low', () => {
        beforeEach(async () => {
            lb = new Leaderboard(rc, { lowToHigh: false });
            await sampleData();
        });

        checkCommon();

        test("check ranks", async () => {
            expect(await lb.rank("foo")).toBe(1);
            expect(await lb.rank("bar")).toBe(2);
            expect(await lb.rank("baz")).toBe(3);
            expect(await lb.rank("non-existing")).toBe(null);
        });
        
        test("peek", async () => {
            expect(await lb.peek("foo")).toStrictEqual({ id: "foo", score: 15, rank: 1 });
            expect(await lb.peek("bar")).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(await lb.peek("baz")).toStrictEqual({ id: "baz", score: 5, rank: 3 });
            expect(await lb.peek("non-existing")).toBe(null);
        });

        test("at", async () => {
            expect(await lb.at(1)).toStrictEqual({ id: "foo", score: 15, rank: 1 });
            expect(await lb.at(100)).toBe(null);
        });
        
        test("top 3", async () => {
            let top = await lb.top(3);
            expect(top).toHaveLength(3);
            expect(top[0]).toStrictEqual({ id: "foo", score: 15, rank: 1 });
            expect(top[1]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[2]).toStrictEqual({ id: "baz", score: 5, rank: 3 });

            expect(top).toStrictEqual(await lb.top());
        });

        test("list 2-3", async () => {
            let top = await lb.list(2, 3);
            expect(top).toHaveLength(2);
            expect(top[0]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[1]).toStrictEqual({ id: "baz", score: 5, rank: 3 });
        });
    });

    describe('low to high', () => {
        beforeEach(async () => {
            lb = new Leaderboard(rc, { lowToHigh: true });
            await sampleData();
        });
        
        checkCommon();

        test("check ranks", async () => {
            expect(await lb.rank("foo")).toBe(3);
            expect(await lb.rank("bar")).toBe(2);
            expect(await lb.rank("baz")).toBe(1);
            expect(await lb.rank("non-existing")).toBe(null);
        });
        
        test("peek", async () => {
            expect(await lb.peek("foo")).toStrictEqual({ id: "foo", score: 15, rank: 3 });
            expect(await lb.peek("bar")).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(await lb.peek("baz")).toStrictEqual({ id: "baz", score: 5, rank: 1 });
            expect(await lb.peek("non-existing")).toBe(null);
        });

        test("at", async () => {
            expect(await lb.at(1)).toStrictEqual({ id: "baz", score: 5, rank: 1 });
            expect(await lb.at(100)).toBe(null);
        });

        test("top 3", async () => {
            let top = await lb.top(3);
            expect(top).toHaveLength(3);
            expect(top[0]).toStrictEqual({ id: "baz", score: 5, rank: 1 });
            expect(top[1]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[2]).toStrictEqual({ id: "foo", score: 15, rank: 3 });
            
            expect(top).toStrictEqual(await lb.top());
        });

        test("list 2-3", async () => {
            let top = await lb.list(2, 3);
            expect(top).toHaveLength(2);
            expect(top[0]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[1]).toStrictEqual({ id: "foo", score: 15, rank: 3 });
        });
    });
});
