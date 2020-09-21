import { Redis } from "ioredis";

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

const aroundRange = (dir: SortDirection) => `
local function aroundRange(path, id, distance, fill_borders)
    local r = redis.call('z${dir === 'desc' ? 'rev' : ''}rank', path, id) -- entry rank

    if r == false or r == nil then
        -- entry does not exist
        return { -1, -1 }
    end
    
    local c = redis.call('zcard', path) -- lb size
    local l = math.max(0, r - distance) -- lower bound rank
    local h = 0                         -- high bound rank

    if fill_borders == 'true' then
        h = l + 2 * distance
        if h >= c then 
            h = math.min(c, r + distance)
            l = math.max(0, h - 2 * distance - 1)
        end
    else
        h = math.min(c, r + distance)
    end

    -- low bound, high bound, lb card, query rank
    return { l, h, c, r };
end
`;

/**
 * `KEYS[1]`: leaderboard key  
 * `ARGV[1]`: entry id  
 * `ARGV[2]`: distance  
 * `ARGV[3]`: fill_borders ('true' or 'false')
 * 
 * Returns [ lowest_rank, [[id, score], ...] ]
 */
const zaround = (dir: SortDirection) => `
${aroundRange(dir)}

local range = aroundRange(KEYS[1], ARGV[1], ARGV[2], ARGV[3]);
-- entry not found
if range[1] == -1 then return { 0, {} } end
return {
    range[1],
    -- retrive final rank
    redis.call('z${dir === 'desc' ? 'rev' : ''}range', KEYS[1], range[1], range[2], 'WITHSCORES')
}
`;

const slice = `
local function slice(array, start, finish)
    local t = {}
    for k = start, finish do
        t[#t+1] = array[k]
    end
    return t
end
`;

const retrieveEntries = (dir: SortDirection) => `
local function retrieveEntries(path, feature_keys, sort_policies, low, high)
    local ids = redis.call('z${dir === 'desc' ? 'rev' : ''}range', path, low, high);
    local features = {}

    while #feature_keys > 0 do
        local key = table.remove(feature_keys, 1)

        local scores = {}
        for n = 1, #ids, 1 do
            table.insert(scores, redis.call('zscore', key, ids[n]))
        end
        features[#features+1] = scores
    end

    -- [
    --   ['foo', 'bar', 'baz'],
    --   [ [1, 2, 3], [4, 5, 6] ]
    -- ]
    return { ids, features }
end
`;

const zmultifind = `
-- id: entry id
-- keys: leaderboard keys
-- sorts: sort policies for each leaderboard
local function retriveEntry(id, keys, sorts)
    local result = {}

    result[#result+1] = id

    for i = 1, #keys, 1 do
        result[#result+1] = redis.call('zscore', keys[i], id)
        result[#result+1] = redis.call('zrank', keys[i], id)
    end

    -- [ id, score, rank, score, rank, ...]
    return result
end

return retriveEntry(ARGV[1], KEYS, ARGV[2])
`;

/**
 * `KEYS[1]`: sorting leaderboard key  
 * `KEYS[2+]`: all feature keys  
 * `ARGV[1]`: low rank  
 * `ARGV[2]`: high rank  
 * `ARGV[3]`: number of feature keys
 * 
 * Returns [ [id, id, id, ...], [score, score, score, ...] ]
 */
const zmultirange = (dir: SortDirection) => `
${slice}
${retrieveEntries(dir)}
return retrieveEntries(KEYS[1], slice(KEYS, 2, ARGV[3]+1), ARGV[1], ARGV[2])
`;

/**
 * `KEYS[1]`: sorting leaderboard key  
 * `KEYS[2+]`: all feature keys  
 * `ARGV[1]`: entry id  
 * `ARGV[2]`: distance  
 * `ARGV[3]`: fill_borders ('true' or 'false')  
 * `ARGV[4]`: number of feature keys
 * 
 * Returns [ [id, id, id, ...], [score, score, score, ...] ]
 */
const zmultiaround = (dir: SortDirection) => `
${slice}
${aroundRange(dir)}
${retrieveEntries(dir)}

local range = aroundRange(KEYS[1], ARGV[1], ARGV[2], ARGV[3]);
if range[1] == -1 then return { {}, { {},{} } } end
return {
    range[1],
    retrieveEntries(KEYS[1], slice(KEYS, 2, ARGV[4]+1), range[1], range[2])
}
`;

/**
 * Defines multiple commands useful to manage leaderboards:
 * * `zbest` & `zrevbest`: replace the score of the specified member if it
 * doesn't exist or the provided score is (**lower** / **higher**)
 * than the old one. Returns the updated score
 * * `zfind` & `zrevfind`: find the score and rank of a given member
 * * `zkeeptop` & `zrevkeeptop`: removes all members that are not in the top N
 * * `zaround` & `zrevaround`: return the entries around an entry in a defined
 * distance with a fill border policy
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
    client.defineCommand("zaround",     { numberOfKeys: 1, lua: zaround('asc')  });
    client.defineCommand("zrevaround",  { numberOfKeys: 1, lua: zaround('desc') });
    client.defineCommand("zmultirange",     { lua: zmultirange('asc') });
    client.defineCommand("zrevmultirange",  { lua: zmultirange('desc') });
    client.defineCommand("zmultiaround",    { lua: zmultiaround('asc') });
    client.defineCommand("zrevmultiaround", { lua: zmultiaround('desc') });
    
    client.defineCommand("zmultifind", { lua: zmultifind });
    
    (client as any).redisRankExtended = true;
}
