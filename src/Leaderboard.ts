import { Redis, KeyType, Pipeline } from 'ioredis';
import { buildScript } from './Common';

export type ID = string;

export type LeaderboardOptions = {
    /** sorted set key */
    path: KeyType,
    /** lower scores are better */
    lowToHigh: boolean
}

export type Entry = {
    /** identifier */
    id: ID,
    /** score */
    score: number,
    /** ranking */
    rank: number
}

export class Leaderboard {
    /** ioredis client */
    private client: Redis;
    /** options */
    private options: LeaderboardOptions;
    /** script source used in improve and improveMulti */
    private improveScript: string;

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

        this.improveScript = `
            local ps = redis.call('zscore',KEYS[1],ARGV[1]);
            if not ps or tonumber(ARGV[2]) ${this.options.lowToHigh ? '<' : '>'} tonumber(ps) then
                redis.call('zadd',KEYS[1],ARGV[2],ARGV[1])
                return 1
            end
            return 0
        `;
    }

    /**
     * Create or update the score of an entry
     */
    async add(id: ID, score: number): Promise<void> {
        await this.client.zadd(this.options.path, score.toString(), id);
    }

    /**
     * @see add
     * 
     * Uses IORedis.Pipeline to be able to batch multiple commands
     */
    addMulti(id: ID, score: number, pipeline: Pipeline): Pipeline {
        return pipeline.zadd(this.options.path, score.toString(), id);
    }
    
    /**
     * Update the score of an entry if its better than the current stored
     * If the entry does not exist, it is added
     * 
     * Note: it respects lowToHigh to know if a score is better
     * 
     * @returns if the score was updated
     */
    async improve(id: ID, score: number): Promise<Boolean> {
        let result = await this.client.eval(this.improveScript, 1, this.options.path, id, score);
        return result === 1;
    }
    
    /**
     * @see improve
     * 
     * Uses IORedis.Pipeline to be able to batch multiple commands
     */
    improveMulti(id: ID, score: number, pipeline: Pipeline): Pipeline {
        return pipeline.eval(this.improveScript, 1, this.options.path, id, score);
    }
    
    /**
     * Increment/decrement the score of an entry by an amount
     * If the entry does not exist, it is added with amount as the score
     * @returns the updated score
     */
    async incr(id: ID, amount: number): Promise<number> {
        let score = await this.client.zincrby(this.options.path, amount, id);
        return parseInt(score, 10);
    }
    
    /**
     * @see incr
     * 
     * Uses IORedis.Pipeline to be able to batch multiple commands
     */
    incrMulti(id: ID, amount: number, pipeline: Pipeline): Pipeline {
        return pipeline.zincrby(this.options.path, amount, id);
    }
    
    /**
     * Removes an entry from the leaderboard
     */
    async remove(id: ID): Promise<void> {
        await this.client.zrem(this.options.path, id);
    }
    
    /**
     * Remove all the entries
     */
    async clear(): Promise<void> {
        await this.client.del(this.options.path);
    }

    /**
     * Retrieve an entry from the leaderboard
     */
    async peek(id: ID): Promise<Entry | null> {
        let result = await this.client.eval(
            `return{` +
                `redis.call('zscore',KEYS[1],ARGV[1]),` +
                `redis.call('z${this.options.lowToHigh ? '' : 'rev'}rank',KEYS[1],ARGV[1])` +
            `}`, // 83 bytes vs 20 bytes using EVALSHA maybe worth it?
            1, this.options.path, id
        );

        return (result[0] === false || result[1] === false || result[0] === null || result[1] === null) ? null : {
            id: id,
            score: parseInt(result[0], 10),
            rank: result[1]+1
        };
    }

    /**
     * Retrieve the score of an entry
     */
    async score(id: ID): Promise<number | null> {
        let score = await this.client.zscore(this.options.path, id);
        return score === null ? null : parseInt(score, 10);
    }

    /**
     * Retrieve the one-based rank of an entry
     */
    async rank(id: ID): Promise<number | null> {
        let rank = await this.client[this.options.lowToHigh ? 'zrank' : 'zrevrank'](this.options.path, id);
        return rank === null ? null : rank+1;
    }

    /**
     * Retrieve the entries ranked between some boundaries (one-based)
     * @param low lower bound to query (inclusive)
     * @param high higher bound to query (inclusive)
     */
    async list(low: number, high: number): Promise<Entry[]> {
        if(low < 1 || high < 1) throw new Error("Out of bounds");
        if(low > high) throw new Error(`high must be greater than low (${low} <= ${high})`);

        let result = await this.client[this.options.lowToHigh ? 'zrange' : 'zrevrange'](this.options.path, low-1, high-1, 'WITHSCORES');
        let entries: Entry[] = [];

        let rank = low;
        for (let i = 0; i < result.length; i += 2) {
            entries.push({
                id: result[i],
                score: parseInt(result[i + 1], 10),
                rank: rank++
            });
        }

        return entries;
    }
    
    /**
     * Retrieve the top entries
     * @param max max number of entries to return
     * 
     * Note: This function is an alias for list(1, max)
     */
    top(max: number = 10): Promise<Entry[]> {
        return this.list(1, max);
    }
    
    /**
     * Retrieve the entry at a specific rank
     * This function is an alias for list(rank, rank)[0]
     * @param rank rank to query
     */
    async at(rank: number): Promise<Entry | null> {
        if(rank <= 0)
            return null;
        let result = await this.list(rank, rank);
        return result.length == 0 ? null : result[0];
    }

    /**
     * Retrieve the entries around an entry
     * 
     * Example with distance = 4:
     * ```
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     * | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th | 10th |
     * +-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
     *                ↑
     *         queried entry
     * 
     * Without fillBorders: [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th ] // 2 + 1 + 4 = 7 elements
     * With fillBorders:    [ 1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th ] // 2 + 1 + 6 = 9 elements
     * ```
     * 
     * @param distance number of entries at each side of the queried entry
     * @param fillBorders whether to include entries at the other side if the entry
     *                    is too close to one of the borders. In other words, it always
     *                    makes sure to have at lease 2*distance+1 entries (if there are
     *                    enough in the leaderboard)
     */
    async around(id: ID, distance: number, fillBorders: boolean = false): Promise<Entry[]> {
        if(distance < 0)
            return [];

        let result = await this.client.eval(buildScript(`
            local range = aroundRange(KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4]);
            if range[1] == -1 then return { 0, {} } end
            return {
                range[1],
                redis.call(ARGV[1] and 'zrange' or 'zrevrange', KEYS[1], range[1], range[2], 'WITHSCORES')
            }
            `),
            1,
            this.options.path,
            
            this.isLowToHigh(),
            id,
            distance,
            fillBorders
        );

        let entries: Entry[] = [];
        let rank = 0;
        for (let i = 0; i < result[1].length; i += 2) {
            entries.push({
                id: result[1][i],
                score: parseInt(result[1][i + 1], 10),
                rank: 1 + result[0] + rank++
            });
        }

        return entries;
    }

    /**
     * Retrieve the the total number of entries
     */
    total(): Promise<number> {
        return this.client.zcard(this.options.path);
    }

    /**
     * Key of the sorted set in Redis
     */
    getPath(): KeyType {
        return this.options.path;
    }

    /**
     * Is this leaderboard ranking from lower to higher scores
     */
    isLowToHigh(): boolean {
        return this.options.lowToHigh;
    }
}
