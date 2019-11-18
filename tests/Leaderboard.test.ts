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
        await lb.add("foo", 15);
        await lb.add("bar", 10);
        await lb.add("baz", 5);
    };

    const checkCommon = () => {
        test("check ranks invalid", async () => {
            expect(await lb.rank("non-existing")).toBe(null);
        });
        test("check scores", async () => {
            expect(await lb.score("foo")).toBe(15);
            expect(await lb.score("bar")).toBe(10);
            expect(await lb.score("baz")).toBe(5);
            expect(await lb.score("non-existing")).toBe(null);
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
        test("peek invalid", async () => {
            expect(await lb.peek("non-existing")).toBe(null);
        });
        test("at invalid", async () => {
            expect(await lb.at(100)).toBe(null);
            expect(await lb.at(-1)).toBe(null);
        });
        test("top 3 default", async () => {
            expect(await lb.top(3)).toStrictEqual(await lb.top());
        });
        test("remove", async () => {
            await lb.add("removal", 42);
            expect(await lb.score("removal")).toBe(42);
            await lb.remove("removal");
            expect(await lb.score("removal")).toBe(null);
        });
        test("incr", async () => {
            expect(await lb.incr("bar", 30)).toBe(40); // existing
            expect(await lb.incr("foobar", 20)).toBe(20); // new
        });
        test("total", async () => {
            expect(await lb.total()).toBe(3);
            await lb.remove("bar");
            expect(await lb.total()).toBe(2);
        });
        test("clear", async () => {
            await lb.clear();
            expect(await lb.total()).toBe(0);
        });
    
        describe('big leaderboard', () => {
            beforeEach(async () => {
                lb.clear();
                for(let i = 0; i <= 20; i++) // so 0th, 1th ... 19th, 20th
                    await lb.add(`${i}th`, i);
            });
            test("around invalid", async () => {
                expect(await lb.around('non-existing', 5)).toHaveLength(0);
                expect(await lb.around('10th', -1)).toHaveLength(0);
            });
            test("around lengths", async () => {
                expect(await lb.around('10th', 0)).toHaveLength(1);
                expect(await lb.around('10th', 1)).toHaveLength(3);
                expect(await lb.around('10th', 5)).toHaveLength(5 + 1 + 5); // 11
                expect(await lb.around('3th', 5)).toHaveLength(3 + 1 + 5); // 8
                expect(await lb.around('17th', 5)).toHaveLength(5 + 1 + 3); // 8
                expect(await lb.around('10th', 50)).toHaveLength(10 + 1 + 10); // 21
            });
            test("around border lengths", async () => {
                expect(await lb.around('10th', 0, true)).toHaveLength(1);
                expect(await lb.around('10th', 1, true)).toHaveLength(3);
                expect(await lb.around('10th', 5, true)).toHaveLength(5 + 1 + 5); // 11
                expect(await lb.around('3th', 5, true)).toHaveLength(7 + 1 + 3); // 11
                expect(await lb.around('17th', 5, true)).toHaveLength(3 + 1 + 7); // 11
                expect(await lb.around('10th', 50, true)).toHaveLength(10 + 1 + 10); // 21
            });
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
        });
        
        test("peek", async () => {
            expect(await lb.peek("foo")).toStrictEqual({ id: "foo", score: 15, rank: 1 });
            expect(await lb.peek("bar")).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(await lb.peek("baz")).toStrictEqual({ id: "baz", score: 5, rank: 3 });
        });

        test("at", async () => {
            expect(await lb.at(1)).toStrictEqual({ id: "foo", score: 15, rank: 1 });
        });
        
        test("top 3", async () => {
            let top = await lb.top(3);
            expect(top).toHaveLength(3);
            expect(top[0]).toStrictEqual({ id: "foo", score: 15, rank: 1 });
            expect(top[1]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[2]).toStrictEqual({ id: "baz", score: 5, rank: 3 });
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
        });
        
        test("peek", async () => {
            expect(await lb.peek("foo")).toStrictEqual({ id: "foo", score: 15, rank: 3 });
            expect(await lb.peek("bar")).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(await lb.peek("baz")).toStrictEqual({ id: "baz", score: 5, rank: 1 });
        });

        test("at", async () => {
            expect(await lb.at(1)).toStrictEqual({ id: "baz", score: 5, rank: 1 });
        });

        test("top 3", async () => {
            let top = await lb.top(3);
            expect(top).toHaveLength(3);
            expect(top[0]).toStrictEqual({ id: "baz", score: 5, rank: 1 });
            expect(top[1]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[2]).toStrictEqual({ id: "foo", score: 15, rank: 3 });
        });

        test("list 2-3", async () => {
            let top = await lb.list(2, 3);
            expect(top).toHaveLength(2);
            expect(top[0]).toStrictEqual({ id: "bar", score: 10, rank: 2 });
            expect(top[1]).toStrictEqual({ id: "foo", score: 15, rank: 3 });
        });
    });
});
