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