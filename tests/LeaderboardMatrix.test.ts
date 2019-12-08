import { LeaderboardMatrix, Leaderboard } from '../src/index';
import rc from './redis';

describe('Leaderboard matrix', () => {
    describe('default', () => {
        test('get', () => {
            let lm = new LeaderboardMatrix(rc);
            let lb = lm.get('global', 'default');
            expect(lb).toBeInstanceOf(Leaderboard);
            expect(lm.get('global', 'default')).toStrictEqual(lb); // should be the same
        });

        test('invalid', () => {
            let lm = new LeaderboardMatrix(rc);
            expect(lm.get('global', 'non-existing')).toBe(null);
            expect(lm.get('non-existing', 'default')).toBe(null);
            expect(lm.get('non-existing', 'non-existing')).toBe(null);
        });
        
        test('custom time', () => {
            let lm = new LeaderboardMatrix(rc);
            let lb = lm.get('global', 'default', new Date(2019, 10, 19));
            expect(lb).toBeInstanceOf(Leaderboard);
            if(lb) expect(lb.getPath()).toBe("lbmatrix:global:default:all");
        });
    });

    test('custom time', () => {
        let lm = new LeaderboardMatrix(rc, {
            path: 'test',
            dimensions: [{
                name: 'weekdim',
                timeFrame: 'weekly'
            }]
        });
        let lb = lm.get('weekdim', 'default', new Date(2019, 10, 19));
        expect(lb).toBeInstanceOf(Leaderboard);
        if(lb) expect(lb.getPath()).toBe("test:weekdim:default:y2019-m11-w47");
    });
    
    describe('multiple dimensions and features', () => {
        let lm: LeaderboardMatrix;

        beforeEach(() => {
            lm = new LeaderboardMatrix(rc, {
                path: 'test',
                dimensions: [{
                    name: 'globaldim',
                    timeFrame: 'all-time'
                },{
                    name: 'monthdim',
                    timeFrame: 'monthly'
                },{
                    name: 'weekdim',
                    timeFrame: 'weekly'
                }],
                features: [{
                    name: 'feat1'
                },{
                    name: 'feat2'
                },{
                    name: 'feat3'
                }],
                now: () => new Date(2019, 10, 19)
            });
        });

        describe('add', () => {
            test('multi', async () => {
                await lm.add("pepe", {
                    feat1: 1,
                    feat2: 2,
                    feat3: 3
                }); // all dimensions
                let lb1 = lm.get("globaldim", "feat1");
                let lb2 = lm.get("globaldim", "feat2");
                let lb3 = lm.get("globaldim", "feat3");

                expect(lb1).toBeInstanceOf(Leaderboard);
                expect(lb2).toBeInstanceOf(Leaderboard);
                expect(lb3).toBeInstanceOf(Leaderboard);

                if(lb1) expect(await lb1.score("pepe")).toBe(1);
                if(lb2) expect(await lb2.score("pepe")).toBe(2);
                if(lb3) expect(await lb3.score("pepe")).toBe(3);
            });

            test('specific dimensions/features', async () => {
                await lm.add("pepe", {
                    feat1: 1
                }, [
                    'monthdim'
                ]);

                let lb1 = lm.get("globaldim", "feat1");
                let lb2 = lm.get("monthdim", "feat1");

                expect(lb1).toBeInstanceOf(Leaderboard);
                expect(lb2).toBeInstanceOf(Leaderboard);

                if(lb2) expect(await lb2.score("pepe")).toBe(1);
                if(lb1) expect(await lb1.score("pepe")).toBe(null);
            });
            
            test('invalid', () => {
                lm.add("pepe", {
                    feat_non_existing: 1
                }, ["globaldim"]);
                expect(lm.get("globaldim", "feat_non_existing")).toBe(null);
            });
        });

        describe('incr', () => {
            test('non existing', async () => {
                await lm.incr("pepe", {
                    feat1: 1
                });
                expect(await lm.peek("pepe", "globaldim")).toHaveProperty("feat1", 1);
            });
            test('existing', async () => {
                await lm.add("pepe", {
                    feat1: 10
                });
                await lm.incr("pepe", {
                    feat1: 1
                });
                expect(await lm.peek("pepe", "globaldim")).toHaveProperty("feat1", 11);
            });
            test('filter dimensions', async () => {
                await lm.add("pepe", {
                    feat1: 1,
                    feat2: 2,
                    feat3: 3
                }); // create in all dimensions
                await lm.incr("pepe", {
                    feat1: 4,
                    feat2: 5,
                    feat3: 6
                }, ["monthdim"]); // incr only in monthly
                expect(await lm.peek("pepe", "globaldim")).toMatchObject({
                    feat1: 1,
                    feat2: 2,
                    feat3: 3
                });
                expect(await lm.peek("pepe", "monthdim")).toMatchObject({
                    feat1: 5,
                    feat2: 7,
                    feat3: 9
                });
            });
            test('invalid feature', async () => {
                lm.incr("pepe", {
                    feat_non_existing: 1
                }, ["globaldim"]);
                expect(lm.get("globaldim", "feat_non_existing")).toBe(null);
            });
        });

        describe('query', () => {
            beforeEach(async () => {
                await lm.add("foo", { feat1: 1, feat2: 4, feat3: 7 });
                await lm.add("bar", { feat1: 2, feat2: 5, feat3: 8 });
                await lm.add("baz", { feat1: 3, feat2: 6, feat3: 9 });
            });

            describe('list', () => {
                test('lengths', async () => {
                    expect(await lm.list("globaldim", "feat1", 1, 1)).toHaveLength(1);
                    expect(await lm.list("globaldim", "feat2", 1, 2)).toHaveLength(2);
                    expect(await lm.list("globaldim", "feat3", 1, 3)).toHaveLength(3);
                    expect(await lm.list("globaldim", "feat1", 2, 1)).toHaveLength(0);
                });
                
                test('invalid', async () => {
                    expect(await lm.list("globaldim", "invalid_feat", 1, 3)).toHaveLength(0);
                    expect(await lm.list("invalid_dim", "feat1", 1, 3)).toHaveLength(0);
                });

                test('data', async () => {
                    expect(await lm.top("globaldim", "feat1", 3)).toStrictEqual([
                        { id: 'baz', rank: 1, feat1: 3, feat2: 6, feat3: 9 },
                        { id: 'bar', rank: 2, feat1: 2, feat2: 5, feat3: 8 },
                        { id: 'foo', rank: 3, feat1: 1, feat2: 4, feat3: 7 },
                    ]);
                });
            });
            
            // the code of aroundRange range is extensively tested on Leaderboard.test.js
            describe('around', () => {
                test('data', async () => {
                    expect(await lm.around("globaldim", "feat1", 'bar', 2)).toStrictEqual([
                        { id: 'baz', rank: 1, feat1: 3, feat2: 6, feat3: 9 },
                        { id: 'bar', rank: 2, feat1: 2, feat2: 5, feat3: 8 },
                        { id: 'foo', rank: 3, feat1: 1, feat2: 4, feat3: 7 },
                    ]);
                });

                test('lengths', async () => {
                    expect(await lm.around("globaldim", "feat1", "bar", 0)).toHaveLength(1);
                    expect(await lm.around("globaldim", "feat1", "bar", 1)).toHaveLength(3);
                    expect(await lm.around("globaldim", "feat1", "baz", 1)).toHaveLength(2);
                    expect(await lm.around("globaldim", "feat1", "foo", 1)).toHaveLength(2);
                    expect(await lm.around("globaldim", "feat1", "baz", 1, true)).toHaveLength(3);
                    expect(await lm.around("globaldim", "feat1", "foo", 1, true)).toHaveLength(3);
                });
                
                test('invalid', async () => {
                    expect(await lm.around("globaldim", "invalid_feat", "bar", 5)).toHaveLength(0);
                    expect(await lm.around("invalid_dim", "feat1", "bar", 5)).toHaveLength(0);
                    expect(await lm.around("globaldim", "feat1", "non-existing", 5)).toHaveLength(0);
                    expect(await lm.around("globaldim", "feat1", "bar", -10)).toHaveLength(0); // invalid distance
                });
            });

            describe('peek', () => {
                test('with rank', async () => {
                    expect(await lm.peek("baz", "globaldim", "feat1")).toStrictEqual({ id: 'baz', rank: 1, feat1: 3, feat2: 6, feat3: 9 });
                });
             
                test('without rank', async () => {
                    expect(await lm.peek("bar", "globaldim")).toStrictEqual({ id: 'bar', rank: 0, feat1: 2, feat2: 5, feat3: 8 });
                });
                
                test('invalid', async () => {
                    expect(await lm.peek("non-existing", "globaldim")).toBeNull();
                    expect(await lm.peek("bar", "invalid_dim")).toBeNull();
                    expect(await lm.peek("non-existing", "globaldim", "feat1")).toBeNull();
                    expect(await lm.peek("bar", "invalid_dim", "feat1")).toBeNull();
                    expect(await lm.peek("non-existing", "globaldim", "invalid-feat")).toBeNull();
                    expect(await lm.peek("bar", "invalid_dim", "invalid-feat")).toBeNull();
                });
            });
        });
    });
    
    test('without timeFrame', () => {
        let lm = new LeaderboardMatrix(rc, {
            dimensions: [{
                name: 'globaldim'
                // no timeFrame
            }]
        });
        let lb = lm.get('globaldim', 'default');
        expect(lb).toBeInstanceOf(Leaderboard);
        if(lb) expect(lb.getPath()).toBe("lbmatrix:globaldim:default:all");
    });
});