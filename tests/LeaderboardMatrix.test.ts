import {
    Leaderboard,
    LeaderboardMatrix,
    MatrixEntryUpdateQuery
} from '../lib/index';
import rc from './redis';

const TEST_KEY = "mlb";

const FOO_BAR_BAZ: MatrixEntryUpdateQuery[] = [
    { id: "foo", values: { feat1: 1, feat2: 2, feat3: 3 } },
    { id: "bar", values: { feat1: 4, feat2: 5, feat3: 6 } },
    { id: "baz", values: { feat1: 7, feat2: 8, feat3: 9 } }
];

describe('LeaderboardMatrix', () => {
    let mlb: LeaderboardMatrix;

    describe('multiple dimensions and features', () => {
        beforeEach(() => {
            mlb = new LeaderboardMatrix(rc, TEST_KEY, {
                dimensions: [
                    { name: "dim1" },
                    { name: "dim2" },
                    { name: "dim3" }
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
                            sortPolicy: 'high-to-low'
                        }
                    },
                    {
                        name: "feat3",
                        options: {
                            updatePolicy: 'replace',
                            sortPolicy: 'high-to-low'
                        }
                    }
                ]
            });
        });

        test("expect correct leaderboards", async () => {
            expect(mlb.getLeaderboard("dim1", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim1", "feat2")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim1", "feat3")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat2")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim2", "feat3")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim3", "feat1")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim3", "feat2")).toBeInstanceOf(Leaderboard);
            expect(mlb.getLeaderboard("dim3", "feat3")).toBeInstanceOf(Leaderboard);
        });

        test("expect invalid leaderboards", async () => {
            expect(mlb.getLeaderboard("bad", "feat1")).toBe(null);
            expect(mlb.getLeaderboard("dim1", "bad")).toBe(null);
        });

        test("update all dimensions", async () => {
            await mlb.update(FOO_BAR_BAZ);
            // expect(mlb.) TODO

            let r3 = await mlb.find("foo");
            console.log("FIND", r3);
            let r5 = await mlb.find("foo-*not");
            console.log("FIND NON EXISTANT", r5);
            let r = await mlb.list("dim1", "feat1", 1, 100);
            console.log("LIST",r);
            let r2 = await mlb.around("dim1", "feat1", "foo", 2, false);
            console.log("AROUND",r2);
        });
    });

});