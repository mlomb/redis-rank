import { Redis } from 'ioredis';
import { PeriodicLeaderboard, TimeFrame } from '../src/index';

let rc: Redis;

beforeAll(() => {
    rc = new (require('ioredis-mock'))();
});
beforeEach((done) => {
    rc.flushall(done);
});

describe('Periodic leaderboard', () => {
    const TEST_DATE = new Date(
        2019, // year
        11 - 1, // month (november)
        18, // day number (18th)
        13, // hour
        54, // minutes
        36 // seconds
    );

    describe('key format', () => {
        const checkFormat = (timeFrame: TimeFrame, expected_format: string) => {
            test(timeFrame as string, () => {
                let plb = new PeriodicLeaderboard(rc, {
                    timeFrame: timeFrame
                });
                expect(plb.getKeyFormat()).toBe(expected_format);
            });
        };

        checkFormat('all-time', "[all]");
        checkFormat('yearly',   "[y]YYYY");
        checkFormat('monthly',  "[y]YYYY-[m]MM");
        checkFormat('weekly',   "[y]YYYY-[m]MM-[w]ww");
        checkFormat('daily',    "[y]YYYY-[m]MM-[w]ww-[d]DD");
        checkFormat('hourly',   "[y]YYYY-[m]MM-[w]ww-[d]DD-[h]HH");
        checkFormat('minute',   "[y]YYYY-[m]MM-[w]ww-[d]DD-[h]HH-[m]mm");
    });

    describe('key generation', () => {
        const checkKey = (timeFrame: TimeFrame, expected_key: string) => {
            test(timeFrame as string, () => {
                let plb = new PeriodicLeaderboard(rc, {
                    timeFrame: timeFrame,
                    now: () => TEST_DATE
                });
                expect(plb.getCurrentKey()).toBe(expected_key);
            });
        };
        
        checkKey('all-time', "all");
        checkKey('yearly',  "y2019");
        checkKey('monthly', "y2019-m11");
        checkKey('weekly',  "y2019-m11-w47");
        checkKey('daily',   "y2019-m11-w47-d18");
        checkKey('hourly',  "y2019-m11-w47-d18-h13");
        checkKey('minute',  "y2019-m11-w47-d18-h13-m54");
    });
    
    test('check leaderboard path', () => {
        let plb = new PeriodicLeaderboard(rc, {
            timeFrame: 'all-time',
            path: 'test'
        });
        expect(plb.getCurrent().getPath()).toBe('test:all');
    });

    test('check leaderboard path change', () => {
        let first = 0;
        let plb = new PeriodicLeaderboard(rc, {
            timeFrame: 'monthly',
            path: 'test',
            now: () => {
                return (first++) ? new Date(2019, 11) : new Date(2019, 10);
            }
        });
        expect(plb.getCurrent().getPath()).toBe('test:y2019-m11');
        expect(plb.getCurrent().getPath()).toBe('test:y2019-m12');
        expect(plb.getCurrent().getPath()).toBe('test:y2019-m12');
    });

    test('random date', () => {
        let plb = new PeriodicLeaderboard(rc, {
            path: "test",
            timeFrame: 'minute'
        });
        expect(plb.get(TEST_DATE).getPath()).toBe("test:y2019-m11-w47-d18-h13-m54");
    });
});
