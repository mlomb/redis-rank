import {
    Leaderboard,
    LeaderboardMatrix,
    MatrixEntry,
    MatrixEntryUpdateQuery,
    MatrixLeaderboardQueryFilter,
    PeriodicLeaderboard,
} from '../lib/index';
import rc from './redis';

const TEST_KEY = "mlb";

const FOO_BAR_BAZ: MatrixEntryUpdateQuery[] = [
    { id: "foo", values: { feat1: 1, feat2: 2 } },
    { id: "bar", values: { feat1: 4, feat2: 5 } },
    { id: "baz", values: { feat1: 7, feat2: 8 } }
];

describe("LeaderboardMatrix", () => {
    let mlb: LeaderboardMatrix;

    describe("multiple dimensions and features", () => {
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

        test("expect correct leaderboards", () => {
            expect(mlb.getLeaderboard("dim1", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim1", "feat2")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat2")).toBeInstanceOf(Leaderboard);
        });

        test("expect invalid leaderboards", () => {
            expect(mlb.getLeaderboard("bad", "feat1")).toBeNull();
            expect(mlb.getLeaderboard("dim1", "bad")).toBeNull();
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
            
            test("list / top", async () => {
                let results = await mlb.list("dim1", "feat1", 1, 100);
                expect(results).toHaveLength(FOO_BAR_BAZ.length);
                expect(results[0]).toMatchObject(baz_correct);
                expect(results[1]).toMatchObject(bar_correct);
                expect(results[2]).toMatchObject(foo_correct);
                expect(results).toMatchObject(await mlb.top("dim1", "feat1"));
            });
            
            test("bottom", async () => {
                let results = await mlb.bottom("dim1", "feat1");
                expect(results).toHaveLength(FOO_BAR_BAZ.length);
                expect(results[0]).toMatchObject(foo_correct);
                expect(results[1]).toMatchObject(bar_correct);
                expect(results[2]).toMatchObject(baz_correct);
            });
            
            test("around", async () => {
                expect(await mlb.around("dim1", "feat1", "foo", 0)).toHaveLength(1); // fillBorders = false
                expect(await mlb.around("dim1", "feat1", "foo", 1)).toHaveLength(2); // fillBorders = false
                expect(await mlb.around("dim1", "feat1", "foo", 2)).toHaveLength(3); // fillBorders = false

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

        describe("showcase", () => {
            test("both meet", async () => {
                await mlb.update(FOO_BAR_BAZ); // update dim1 and dim2
                let entries = await mlb.top("dim1", "feat1", 3);
                expect(await mlb.showcase(["dim1"], "feat1", 3)).toMatchObject({ dimension: "dim1", entries });
                expect(await mlb.showcase(["dim2"], "feat1", 3)).toMatchObject({ dimension: "dim2", entries });
                expect(await mlb.showcase(["dim1", "dim2"], "feat1", 3)).toMatchObject({ dimension: "dim1", entries });
                expect(await mlb.showcase(["dim2", "dim1"], "feat1", 3)).toMatchObject({ dimension: "dim2", entries });
            });

            test("dim1 does not meet", async () => {
                await mlb.update(FOO_BAR_BAZ, ["dim2"]); // update only dim2
                let entries = await mlb.top("dim2", "feat1", 3);
                expect(await mlb.showcase(["dim1"], "feat1", 3)).toBeNull();
                expect(await mlb.showcase(["dim2"], "feat1", 3)).toMatchObject({ dimension: "dim2", entries });
                expect(await mlb.showcase(["dim1", "dim2"], "feat1", 3)).toMatchObject({ dimension: "dim2", entries });
                expect(await mlb.showcase(["dim2", "dim1"], "feat1", 3)).toMatchObject({ dimension: "dim2", entries });
            });
            
            test("none meet", async () => {
                await mlb.update(FOO_BAR_BAZ, ["dim2"]); // update only dim2
                let entries = await mlb.top("dim2", "feat1", 5);
                expect(await mlb.showcase(["dim1", "dim2"], "feat1", 5)).toMatchObject({ dimension: "dim2", entries });
                expect(await mlb.showcase(["dim2", "dim1"], "feat1", 5)).toMatchObject({ dimension: "dim2", entries });
            });

            test("empty or invalid", async () => {
                await mlb.update(FOO_BAR_BAZ);
                expect(await mlb.showcase([], "feat1", 3)).toBeNull();
                expect(await mlb.showcase(["invalid"], "feat1", 3)).toBeNull();
                expect(await mlb.showcase(["dim1"], "invalid", 3)).toBeNull();
            });
        });
        
        test("update filter features", async () => {
            await mlb.update({
                id: "foo",
                values: {
                    feat1: 99
                    // don't update feat2
                }
            });
            let foo = await mlb.find("foo");
            expect(foo).not.toBeNull();
            for(let dim of ['dim1', 'dim2']) {
                expect(foo!.scores[dim].feat1).toBe(99);
                expect(foo!.scores[dim].feat2).toBe(undefined);
            }
        });
        
        test("update filter dimensions", async () => {
            await mlb.update({
                id: "foo",
                values: {
                    feat1: 99,
                    feat2: 123
                }
            }, ["dim1"]); // only update dim1
            let foo = await mlb.find("foo");
            expect(foo).not.toBeNull();
            expect(foo!.scores.dim1.feat1).toBe(99);
            expect(foo!.scores.dim1.feat2).toBe(123);
            expect(foo!.scores.dim2).toBe(undefined);
        });

        describe("filter queries", () => {
            beforeEach(async () => {
                await mlb.update(FOO_BAR_BAZ);
            });

            const filter: MatrixLeaderboardQueryFilter = {
                dimensions: ["dim1"],
                features: ["feat2"]
            };

            function checkFilter(entry: MatrixEntry | null) {
                expect(entry).not.toBeNull();
                expect(entry!.scores.dim1).not.toBeUndefined();
                expect(entry!.scores.dim2).toBeUndefined();
                expect(entry!.ranks.dim1).not.toBeUndefined();
                expect(entry!.ranks.dim2).toBeUndefined();
                
                expect(entry!.scores.dim1.feat1).toBeUndefined();
                expect(entry!.scores.dim1.feat2).not.toBeUndefined();
                expect(entry!.ranks.dim1.feat1).toBeUndefined();
                expect(entry!.ranks.dim1.feat2).not.toBeUndefined();
            }
        
            test("find", async () => {
                checkFilter(await mlb.find("foo", filter));
            });
            
            test("list (top)", async () => {
                let results = await mlb.top("dim1", "feat2", 10, filter);
                for(let e of results)
                    checkFilter(e);
            });
            
            test("bottom", async () => {
                let results = await mlb.bottom("dim1", "feat2", 10, filter);
                for(let e of results)
                    checkFilter(e);
            });

            test("around", async () => {
                let results = await mlb.around("dim1", "feat2", "foo", 10, true, filter);
                for(let e of results)
                    checkFilter(e);
            });
            
            test("showcase", async () => {
                let results = await mlb.showcase(["dim1"], "feat2", 3, filter);
                expect(results).not.toBeNull();
                for(let e of results!.entries)
                    checkFilter(e);
            });

            test("should include the sorting pair", async () => {
                let results = await mlb.around("dim2", "feat1", "foo", 10, true, filter); // note we're querying dim2/feat1
                for(let entry of results) {
                    // the dimension/feature pair cannot be filtered

                    expect(entry.scores.dim1).not.toBeUndefined();
                    expect(entry.scores.dim2).not.toBeUndefined();
                    expect(entry.scores.dim1.feat1).not.toBeUndefined();
                    expect(entry.scores.dim1.feat2).not.toBeUndefined();
                    expect(entry.scores.dim2.feat1).not.toBeUndefined();
                    expect(entry.scores.dim2.feat2).not.toBeUndefined();
                }
            });
            
            test("empty filter", async () => {
                expect(await mlb.find("foo", { dimensions: [] })).toBeNull();
                expect(await mlb.find("foo", { features: [] })).toBeNull();
                expect(await mlb.find("foo", { dimensions: [], features: [] })).toBeNull();
            });
        });
        
        test("invalid updates", async () => {
            await mlb.update({
                id: "foo",
                values: {
                    feat1: 5,
                    badcoffe: 6
                }
            }, ["invalid", "dim1"]);
            // only feat1 on dim1 should be updated
            let foo = await mlb.find("foo");
            expect(foo!.scores.dim1.feat1).toBe(5);
            expect(foo!.scores.invalid).toBe(undefined);
        });

        describe("invalid queries", () => {
            beforeEach(async () => {
                await mlb.update(FOO_BAR_BAZ);
            });
            
            test("invalid find", async () => {
                expect(await mlb.find("invalid")).toBeNull();
            });

            test("invalid list", async () => {
                expect(await mlb.list("bad", "feat1", 1, 100)).toHaveLength(0);
                expect(await mlb.list("dim1", "bad", 1, 100)).toHaveLength(0);
                expect(await mlb.list("dim1", "feat1", 100, 1)).toHaveLength(0);
            });

            test("invalid around", async () => {
                expect(await mlb.around("bad", "feat1", "foo", 10)).toHaveLength(0);
                expect(await mlb.around("dim1", "bad", "foo", 10)).toHaveLength(0);
                expect(await mlb.around("dim1", "feat1", "bad", 10)).toHaveLength(0);
            });
        });

        describe("remove", () => {
            beforeEach(async () => {
                await mlb.update(FOO_BAR_BAZ);
                expect(await mlb.find("foo")).not.toBeNull();
                expect(await mlb.find("bar")).not.toBeNull();
                expect(await mlb.find("baz")).not.toBeNull();
            });

            test("single", async () => {
                await mlb.remove("foo");
                expect(await mlb.find("foo")).toBeNull();
                expect(await mlb.find("bar")).not.toBeNull();
                expect(await mlb.find("baz")).not.toBeNull();
            });

            test("multiple", async () => {
                await mlb.remove(["foo", "bar"]);
                expect(await mlb.find("foo")).toBeNull();
                expect(await mlb.find("bar")).toBeNull();
                expect(await mlb.find("baz")).not.toBeNull();
            });

            test("remove filtered dimension", async () => {
                await mlb.remove("foo", ["dim1"]);
                let foo = await mlb.find("foo");
                expect(foo).not.toBeNull();
                expect(foo!.scores.dim1).toBeUndefined();
                expect(foo!.scores.dim2).not.toBeUndefined();
            });

            test("remove filtered feature", async () => {
                await mlb.remove("foo", undefined, ["feat1"]);
                let foo = await mlb.find("foo");
                expect(foo).not.toBeNull();
                expect(foo!.scores.dim1.feat1).toBeUndefined();
                expect(foo!.scores.dim1.feat2).not.toBeUndefined();
                expect(foo!.scores.dim2.feat1).toBeUndefined();
                expect(foo!.scores.dim2.feat2).not.toBeUndefined();
            });
            
            test("invalid are ignored", async () => {
                await mlb.remove("foo", ["invalid"]);
                expect(await mlb.find("foo")).not.toBeNull();
                await mlb.remove("foo", undefined, ["invalid"]);
                expect(await mlb.find("foo")).not.toBeNull();
            });
        });
    
        test("count", async () => {
            await mlb.update([
                // 1
                { id: '1', values: { feat1: 1 } },
                // 2
                { id: '2', values: { feat2: 1 } },
                { id: '3', values: { feat2: 1 } },
            ], ["dim1"]);
            await mlb.update([
                // 3
                { id: '3', values: { feat1: 1 } },
                { id: '4', values: { feat1: 1 } },
                { id: '5', values: { feat1: 1 } },
                // 4
                { id: '6', values: { feat2: 1 } },
                { id: '7', values: { feat2: 1 } },
                { id: '8', values: { feat2: 1 } },
                { id: '9', values: { feat2: 1 } }
            ], ["dim2"]);
            expect(await mlb.count()).toMatchObject({
                dim1: {
                    feat1: 1,
                    feat2: 2
                },
                dim2: {
                    feat1: 3,
                    feat2: 4
                }
            })
        });
    });
    
    test("top N", async () => {
        mlb = new LeaderboardMatrix(rc, TEST_KEY, {
            dimensions: [
                { name: "dim1" }
            ],
            features: [{
                name: "feat1",
                options: {
                    updatePolicy: 'replace',
                    sortPolicy: 'high-to-low',
                    limitTopN: 2
                }
            }]
        });
        await mlb.update({ id: "foo", values: { feat1: 1 }});
        await mlb.update({ id: "bar", values: { feat1: 2 }});
        await mlb.update({ id: "baz", values: { feat1: 3 }});
        expect(await mlb.top("dim1", "feat1")).toHaveLength(2);
        await mlb.update(FOO_BAR_BAZ);
        expect(await mlb.top("dim1", "feat1")).toHaveLength(2);
    });

    test("periodic leaderboards", () => {
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