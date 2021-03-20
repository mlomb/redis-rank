import { Redis } from 'ioredis';

type SortDirection = 'desc' | 'asc';

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry score  
 * `ARGV[2]`: entry id
 * 
 * Returns the final score
 */
const zbest = (dir: SortDirection) => `
    -- retrieve current score
    local ps = redis.call('zscore', KEYS[1], ARGV[2]);
    -- if it doesn't exist or the new score is better
    if not ps or tonumber(ARGV[1]) ${dir === 'desc' ? '>' : '<'} tonumber(ps) then
        -- replace entry
        redis.call('zadd', KEYS[1], ARGV[1], ARGV[2])
        return tonumber(ARGV[1])
    end
    return tonumber(ps)
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry id
 * 
 * Returns [score, rank]
 */
const zfind = (dir: SortDirection) => `
    return {
        redis.call('zscore', KEYS[1], ARGV[1]),
        redis.call('z${dir === 'desc' ? 'rev' : ''}rank', KEYS[1], ARGV[1])
    }
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: top N  
 */
const zkeeptop = (dir: SortDirection) => `
local c = redis.call('zcard', KEYS[1]);
local n = tonumber(ARGV[1])
local dif = c - n
if dif > 0 then
    ${dir === 'asc' ? `
    -- low to high
    redis.call('zremrangebyrank', KEYS[1], -1, - dif)
    ` : `
    -- high to low
    redis.call('zremrangebyrank', KEYS[1], 0, dif - 1)
    `}
end
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: min score  
 * `ARGV[2]`: max score
 * 
 * Returns [ lowest_rank, [[id, score], ...] ]
 */
const zrangescore = (dir: SortDirection) => `
local c = redis.call(
    'z${dir === 'desc' ? 'rev' : ''}rangebyscore',
    KEYS[1],
    ${dir === 'desc' ? 'ARGV[2]' : 'ARGV[1]'},
    ${dir === 'desc' ? 'ARGV[1]' : 'ARGV[2]'},
    'WITHSCORES'
);
if #c > 0 then
    local r = redis.call('z${dir === 'desc' ? 'rev' : ''}rank', KEYS[1], c[1]);
    return { r, c }
else
    return { -1, {} }
end
`;

const aroundRange = `
local function aroundRange(path, id, distance, fill_borders, sort_dir)
    local r = redis.call((sort_dir == 'low-to-high') and 'zrank' or 'zrevrank', path, id) -- entry rank

    if r == false or r == nil then
        -- entry does not exist
        return { -1, -1, -1, -1 }
    end
    
    local c = redis.call('zcard', path) -- lb size
    local l = math.max(0, r - distance) -- lower bound rank
    local h = 0                         -- upper bound rank

    if fill_borders == 'true' then
        h = l + 2 * distance
        if h >= c then 
            h = math.min(c, r + distance)
            l = math.max(0, h - 2 * distance - 1)
        end
    else
        h = math.min(c, r + distance)
    end

    -- lower bound, upper bound, lb card, query rank
    return { l, h, c, r };
end
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry id  
 * `ARGV[2]`: distance  
 * `ARGV[3]`: fill_borders ('true' or 'false')  
 * `ARGV[4]`: sort_dir ('high-to-low' or 'low-to-high')
 * 
 * Returns [ lowest_rank, [[id, score], ...] ]
 */
const zaround = `
${aroundRange}

local range = aroundRange(KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4]);
-- entry not found
if range[1] == -1 then return { 0, {} } end
return {
    range[1],
    -- retrive final rank
    redis.call((ARGV[4] == 'low-to-high') and 'zrange' or 'zrevrange', KEYS[1], range[1], range[2], 'WITHSCORES')
}
`;

const retrieveEntry = `
-- id: entry id
-- keys: leaderboard keys
-- sorts: sort policies for each leaderboard
local function retrieveEntry(id, keys, sorts)
    local result = {}

    result[#result+1] = id

    for i = 1, #keys, 1 do
        result[#result+1] = redis.call('zscore', keys[i], id)
        -- skip zrank if we know it is going to fail
        if result[#result] == nil then
            result[#result+1] = nil
        else
            result[#result+1] = redis.call((sorts[i] == 'low-to-high') and 'zrank' or 'zrevrank', keys[i], id)
        end
    end

    -- [ id, score, rank, score, rank, ...]
    return result
end
`;

const retrieveEntries = `
${retrieveEntry}

-- keys: leaderboard keys
-- sorts: sort policies for each leaderboard
-- sort_index: index of the key to do the zrange
-- lower: lower bound rank
-- upper: upper bound rank
local function retrieveEntries(keys, sorts, sort_index, lower, upper)
    local ids = redis.call(
        (sorts[sort_index] == 'low-to-high') and 'zrange' or 'zrevrange',
        keys[sort_index],
        lower,
        upper
    )

    local results = {}

    for i = 1, #ids, 1 do
        results[#results+1] = retrieveEntry(ids[i], keys, sorts)
    end
    
    -- [
    --    [ id, score, rank, score, rank, ...],
    --    ...
    -- ]
    return results
end
`;

/**
 * `KEYS`: leaderboard keys  
 * `ARGV[1 .. #KEYS]`: sort policies for each leaderboard  
 * `ARGV[#KEYS + 2]`: id to find
 * 
 * Returns an array of size 1 of entries from `retrieveEntry`
 */
const zmatrixfind = `
${retrieveEntry}
return { retrieveEntry(ARGV[#KEYS + 2], KEYS, ARGV) }
`;

/**
 * `KEYS`: leaderboard keys  
 * `ARGV[1 .. #KEYS]`: sort policies for each leaderboard  
 * `ARGV[#KEYS + 1]`: index of the leaderboard used to sort  
 * `ARGV[#KEYS + 2]`: lower rank  
 * `ARGV[#KEYS + 3]`: upper rank
 * 
 * Returns an array of entries from `retrieveEntry`
 */
const zmatrixrange = `
${retrieveEntries}
return retrieveEntries(
    KEYS,
    ARGV,
    tonumber(ARGV[#KEYS + 1]),
    ARGV[#KEYS + 2],
    ARGV[#KEYS + 3]
)
`;

/**
 * `KEYS`: leaderboard keys  
 * `ARGV[1 .. #KEYS]`: sort policies for each leaderboard  
 * `ARGV[#KEYS + 1]`: index of the leaderboard used to sort  
 * `ARGV[#KEYS + 2]`: entry id  
 * `ARGV[#KEYS + 3]`: distance  
 * `ARGV[#KEYS + 4]`: fill_borders ('true' or 'false')  
 * 
 * Returns an array of entries from `retrieveEntry`
 */
const zmatrixaround = `
${aroundRange}
${retrieveEntries}

local sortIndex = tonumber(ARGV[#KEYS + 1])

local range = aroundRange(
    KEYS[sortIndex],
    ARGV[#KEYS + 2],
    ARGV[#KEYS + 3],
    ARGV[#KEYS + 4],
    ARGV[sortIndex]
)

if range[1] == -1 then return { } end
return retrieveEntries(
    KEYS,
    ARGV,
    sortIndex,
    range[1],
    range[2]
)
`;

/**
 * Defines multiple commands useful to manage leaderboards:
 * * `zbest` & `zrevbest`: replace the score of the specified member if it
 * doesn't exist or the provided score is (**lower** / **higher**) than the old one. Returns the updated score
 * * `zfind` & `zrevfind`: find the score and rank of a given member
 * * `zkeeptop` & `zrevkeeptop`: removes all members that are not in the top N
 * * `zaround`: return the entries around an entry in a defined distance with
 * a fill border policy
 * * `zrangescore` & `zrevrangescore`: return the entries between scores
 * * `zmatrixfind`, `zmatrixrange` and `zmatrixaround`: equivalent to their
 * non-matrix versions but using a matrix of leaderboards
 * 
 * @see https://github.com/luin/ioredis#lua-scripting
 * @param client the client to define the commands
 */
export function extendRedisClient(client: Redis) {
    // avoid defining the commands over and over again
    if((client as any).redisRankExtended)
        return;

    client.defineCommand("zbest",       { numberOfKeys: 1, lua: zbest('asc')    });
    client.defineCommand("zrevbest",    { numberOfKeys: 1, lua: zbest('desc')   });
    client.defineCommand("zfind",       { numberOfKeys: 1, lua: zfind('asc')    });
    client.defineCommand("zrevfind",    { numberOfKeys: 1, lua: zfind('desc')   });
    client.defineCommand("zkeeptop",    { numberOfKeys: 1, lua: zkeeptop('asc')  });
    client.defineCommand("zrevkeeptop", { numberOfKeys: 1, lua: zkeeptop('desc') });
    client.defineCommand("zaround",     { numberOfKeys: 1, lua: zaround  });
    client.defineCommand("zrangescore",    { numberOfKeys: 1, lua: zrangescore('asc')  });
    client.defineCommand("zrevrangescore", { numberOfKeys: 1, lua: zrangescore('desc') });
    client.defineCommand("zmatrixfind",   { lua: zmatrixfind });
    client.defineCommand("zmatrixrange",  { lua: zmatrixrange });
    client.defineCommand("zmatrixaround", { lua: zmatrixaround });
    
    (client as any).redisRankExtended = true;
}
