import { Redis, KeyType } from 'ioredis';

type LeaderboardOptions = {
    /** sorted set key */
    path: KeyType,
    /** lower scores are better */
    lowToHigh: boolean
}

type ID = string;

export default class Leaderboard {
    /** ioredis client */
    client: Redis;
    /** options */
    options: LeaderboardOptions;

    /**
     * Create a new leaderboard
     * @param client ioredis client
     * @param path path to the sorted set
     */
    constructor(client: Redis, options: Partial<LeaderboardOptions> = {}) {
        this.client = client;
        
        this.options = Object.assign({
            path: "lb",
            lowToHigh: false
        }, options);
    }

    /**
     * Set a score
     */
    async set(id: ID, score: number): Promise<void> {
        await this.client.zadd(this.options.path, score.toString(), id);
    }
    
    /**
     * Removes an entry from the leaderboard
     */
    async drop(id: ID): Promise<void> {
        await this.client.zrem(this.options.path, id);
    }

    /**
     * Retrieve the score of an entry
     */
    async score(id: ID): Promise<number | null> {
        let result = await this.client.zscore(this.options.path, id);
        return result === null ? null : parseInt(result, 10);
    }

    /**
     * Retrieve the one-based rank of an entry
     */
    async rank(id: ID): Promise<number | null> {
        let result = await this.client[this.options.lowToHigh ? 'zrank' : 'zrevrank'](this.options.path, id);
        return result === null ? null : result+1;
    }
}
