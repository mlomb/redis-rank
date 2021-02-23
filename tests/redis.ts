import Redis from 'ioredis';

let rc = new Redis({ db: 15 });

beforeEach((done) => {
    rc.flushdb(done);
});
afterAll(() => {
    rc.disconnect();
});

export default rc;
