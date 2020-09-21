import {
    Leaderboard,
    LeaderboardMatrix,
    MatrixEntry,
    MatrixEntryUpdateQuery,
    PeriodicLeaderboard
} from '../lib/index';
import rc from './redis';

const TEST_KEY = "mlb";

const FOO_BAR_BAZ: MatrixEntryUpdateQuery[] = [
    { id: "foo", values: { feat1: 1, feat2: 2 } },
    { id: "bar", values: { feat1: 4, feat2: 5 } },
    { id: "baz", values: { feat1: 7, feat2: 8 } }
];

describe('LeaderboardMatrix', () => {
    let mlb: LeaderboardMatrix;

    describe('multiple dimensions and features', () => {
        beforeEach(() => {
            mlb = new LeaderboardMatrix(rc, TEST_KEY, {
                dimensions: [
                    { name: "dim1" },
                    { name: "dim2" }
                ],
                features: [
                    {
                        name: "feat1",
                        options: {
                            updatePolicy: 'replace',
                            sortPolicy: 'high-to-low'
                        }
                    },
                    {
                        name: "feat2",
                        options: {
                            updatePolicy: 'replace',
                            sortPolicy: 'low-to-high'
                        }
                    }
                ]
            });
        });

        test("expect correct leaderboards", async () => {
            expect(mlb.getLeaderboard("dim1", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim1", "feat2")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat2")).toBeInstanceOf(Leaderboard);
        });

        test("expect invalid leaderboards", async () => {
            expect(mlb.getLeaderboard("bad", "feat1")).toBe(null);
            expect(mlb.getLeaderboard("dim1", "bad")).toBe(null);
        });

        test("update single", async () => {
            await mlb.update({
                id: "foo",
                values: {
                    feat1: 22,
                    feat2: 33
                }
            });
            let foo = await mlb.find("foo");
            expect(foo).not.toBeNull();
            for(let dim of ['dim1', 'dim2']) {
                expect(foo!.ranks[dim].feat1).toBe(1);
                expect(foo!.scores[dim].feat1).toBe(22);
                expect(foo!.ranks[dim].feat2).toBe(1);
                expect(foo!.scores[dim].feat2).toBe(33);
            }
        });

        // feat1 ↓
        // feat2 ↑
        describe("update multiple & queries", () => {
            beforeEach(async () => {
                await mlb.update(FOO_BAR_BAZ);
            });

            // dim1 should be equal to dim2 so don't check it
            const foo_correct: MatrixEntry = {
                id: 'foo',
                ranks: { dim1: {
                    feat1: 3,
                    feat2: 1
                } },
                scores: {
                    dim1: FOO_BAR_BAZ[0].values
                }
            };
            const bar_correct: MatrixEntry = {
                id: 'bar',
                ranks: { dim1: {
                    feat1: 2,
                    feat2: 2
                } },
                scores: {
                    dim1: FOO_BAR_BAZ[1].values
                }
            };
            const baz_correct: MatrixEntry = {
                id: 'baz',
                ranks: { dim1: {
                    feat1: 1,
                    feat2: 3
                } },
                scores: {
                    dim1: FOO_BAR_BAZ[2].values
                }
            };
            
            test("find", async () => {
                let foo = await mlb.find("foo");
                let bar = await mlb.find("bar");
                let baz = await mlb.find("baz");
    
                expect(foo).not.toBeNull();
                expect(bar).not.toBeNull();
                expect(baz).not.toBeNull();

                expect(foo).toMatchObject(foo_correct);
                expect(bar).toMatchObject(bar_correct);
                expect(baz).toMatchObject(baz_correct);
            });
            
            test("list (top)", async () => {
                let results = await mlb.top("dim1", "feat1", 10);
                expect(results).toHaveLength(FOO_BAR_BAZ.length);
                expect(results[0]).toMatchObject(baz_correct);
                expect(results[1]).toMatchObject(bar_correct);
                expect(results[2]).toMatchObject(foo_correct);
            });
            
            test("around", async () => {
                expect(await mlb.around("dim1", "feat1", "foo", 0, false)).toHaveLength(1);
                expect(await mlb.around("dim1", "feat1", "foo", 1, false)).toHaveLength(2);
                expect(await mlb.around("dim1", "feat1", "foo", 2, false)).toHaveLength(3);

                expect(await mlb.around("dim1", "feat1", "foo", 0, true)).toHaveLength(1);
                expect(await mlb.around("dim1", "feat1", "foo", 1, true)).toHaveLength(3);
                expect(await mlb.around("dim1", "feat1", "foo", 2, true)).toHaveLength(3);

                let results = await mlb.around("dim1", "feat1", "foo", 100, true);
                expect(results).toHaveLength(FOO_BAR_BAZ.length);
                expect(results[0]).toMatchObject(baz_correct);
                expect(results[1]).toMatchObject(bar_correct);
                expect(results[2]).toMatchObject(foo_correct);
            });
        });
    });

    test('periodic leaderboards', async () => {
        const reference_date = new Date();

        mlb = new LeaderboardMatrix(rc, TEST_KEY, {
            dimensions: [
                {
                    name: "periodic",
                    cycle: 'minute'
                },
                {
                    name: "normal" // (non periodic)
                }
            ],
            features: [
                {
                    name: "feat",
                    options: {
                        updatePolicy: 'replace',
                        sortPolicy: 'high-to-low'
                    }
                }
            ],
            now: () => reference_date
        });

        let periodic = new PeriodicLeaderboard(rc, `${TEST_KEY}:periodic:feat`, {
            cycle: 'minute',
            leaderboardOptions: {
                updatePolicy: 'replace',
                sortPolicy: 'high-to-low'
            },
            now: () => reference_date
        });

        expect(mlb.getLeaderboard("periodic", "feat")!.redisKey).toBe(periodic.getLeaderboardNow().redisKey);
        expect(mlb.getLeaderboard("normal", "feat")!.redisKey).toBe(`${TEST_KEY}:normal:feat`);
    });
});