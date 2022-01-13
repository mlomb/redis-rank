import Redis from "ioredis";

let rc = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    db: 15,
});

beforeEach((done) => {
    rc.flushdb(done);
});
afterAll(() => {
    rc.disconnect();
});

export default rc;
