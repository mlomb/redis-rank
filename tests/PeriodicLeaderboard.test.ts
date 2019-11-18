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
    describe('key format', () => {
        const checkFormat = (timeFrame: TimeFrame, expected_format: string) => {
            test(timeFrame as string, () => {
                let lb = new PeriodicLeaderboard(rc, {
                    timeFrame: timeFrame
                });
                expect(lb.getKeyFormat()).toBe(expected_format);
            });
        };

        checkFormat("all-time", "[all]");
        checkFormat("yearly",   "[y]YYYY");
        checkFormat("monthly",  "[y]YYYY-[m]MM");
        checkFormat("weekly",   "[y]YYYY-[m]MM-[w]w");
        checkFormat("daily",    "[y]YYYY-[m]MM-[w]w-[d]D");
        checkFormat("hourly",   "[y]YYYY-[m]MM-[w]w-[d]D-[h]HH");
        checkFormat("minute",   "[y]YYYY-[m]MM-[w]w-[d]D-[h]HH-[m]mm");
    });

    describe('key generation', () => {
        const checkKey = (timeFrame: TimeFrame, expected_key: string) => {
            test(timeFrame as string, () => {
                let lb = new PeriodicLeaderboard(rc, {
                    timeFrame: timeFrame,
                    now: () => new Date(
                        2019, // year
                        11 - 1, // month (november)
                        18, // day number (18th)
                        13, // hour
                        54, // minutes
                        36 // seconds
                    )
                });
                expect(lb.getCurrentKey()).toBe(expected_key);
            });
        };
        
        checkKey("all-time", "all");
        checkKey("yearly",  "y2019");
        checkKey("monthly", "y2019-m11");
        checkKey("weekly",  "y2019-m11-w47");
        checkKey("daily",   "y2019-m11-w47-d18");
        checkKey("hourly",  "y2019-m11-w47-d18-h13");
        checkKey("minute",  "y2019-m11-w47-d18-h13-m54");
    });
});
