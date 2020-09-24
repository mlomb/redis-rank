
<h1 align="center" style="border-bottom: none">📊 redis-rank</h1>
<h3 align="center">Manage real-time leaderboards using <a href="https://redis.io">Redis</a></h3>

<p align="center">
  <a href="https://travis-ci.org/mlomb/redis-rank">
    <img alt="Build Status" src="https://travis-ci.org/mlomb/redis-rank.svg?branch=master">
  </a>
  <a href="https://codecov.io/gh/mlomb/redis-rank">
    <img alt="codecov" src="https://codecov.io/gh/mlomb/redis-rank/branch/master/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/redis-rank">
    <img alt="codecov" src="https://img.shields.io/npm/v/redis-rank">
  </a>
</p>

# Features
* **Lightweight**: minimal dependencies, only [ioredis](https://github.com/luin/ioredis) is required
* **Performance**: guaranteed _at most_ one trip to Redis on each function call*, taking advantage of [ioredis's pipelining](https://github.com/luin/ioredis#pipelining) and [Lua scripts](https://redis.io/commands/eval)
* **Drop-in replacement**: use any existing sorted set as a leaderboard
* **Clear interface**: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)-based & provides [TypeScript](https://www.typescriptlang.org) definitions
* **Periodic leaderboards**: create recurring leaderboards: _daily_, _weekly_, _monthly_, etc or use a custom cycle
* **Combine leaderboards**: create a matrix of leaderboards: update, filter and retrieve multiple entries in a single call
* **Export**: export your leaderboards for long-term storage
* **Tested**: 100% code coverage

# Quick Start

## ⚙️ Install

```shell
$ npm install redis-rank ioredis
```

Redis 2.6.12 or newer is required. The package [ioredis](https://www.npmjs.com/package/ioredis) is a peer dependency and must be installed separately.

## 🔗 Import and connect

First import/require `ioredis` and `redis-rank`.

ES5
```javascript
const Redis = require('ioredis');
const { Leaderboard } = require('redis-rank');
```
ES6
```javascript
import { Redis } from 'ioredis';
import { Leaderboard } from 'redis-rank';
```

You will have to provide a [ioredis](https://github.com/luin/ioredis) connection.
See [here](https://github.com/luin/ioredis#connect-to-redis) for more information.

```javascript
let client = new Redis({
  host: "127.0.0.1",
  port: 6379
});
```

Continue reading for a TL;DR, [jump to the API documentation](docs/) or go straight to the [examples](docs/EXAMPLES.md).

# TL;DR

Ranks are 1-based. Most functions return a [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise).  
Detailed API documentation can be found in [/docs](docs/).
Examples can be found in [/docs/EXAMPLES.md](docs/EXAMPLES.md).

### Leaderboard

```javascript
const lb = new Leaderboard(client, 'lb:sample', {
    sortPolicy: 'high-to-low', // or 'low-to-high'
    updatePolicy: 'best' // or 'aggregate' or 'best'
    // limitTopN: 1000 // only keep top N entries
});

// insert/update (if it doesn't exist, it will be created)
lb.updateOne("player-1", 123);
lb.update({ id: "player-1", value: 123 });
lb.update([
    { id: "player-1", value: 123 },
    { id: "player-2", value: 420 },
    { id: "player-3", value: 696 }
]);
lb.update({ id: "player-1", value: 123 }, 'replace'); // override the default update policy

// remove
lb.remove("player-1");
lb.remove(["player-1", "player-2", "player-3"]);
lb.clear(); // remove all

// find (null if not found)
lb.score("player-1"); /// === 123
lb.rank("player-1"); /// === 3
lb.find("player-1"); /// === { id: "player-1", score: 123, rank: 3 }
lb.at(3); /// === { id: "player-1", score: 123, rank: 3 }

// query
lb.top(10); /// === [{ id: "n1", score: 999, rank: 1 }, ... 9 more]
lb.bottom(10); /// === [{ id: "n10", score: 111, rank: 10 }, ... 9 more]
lb.list(100, 200); /// === [{ id: "n100", score: 100, rank: 100 }, ... 100 more]
lb.around("player-1", 4); /// === [... 4 more, { id: "player-1", score: 100, rank: 5 }, ... 4 more]

// export
let stream = lb.exportStream(100); // batch size
stream.on("data", (entries) => { /* process entries */ });
stream.on("close", () => { /* finished */ });

// misc
lb.count(); /// === 3
```

### Periodic Leaderboard

```javascript
const plb = new PeriodicLeaderboard(client, "plb:sample", {
    leaderboardOptions: {
        sortPolicy: 'high-to-low',
        updatePolicy: 'replace'
    },
    cycle: 'weekly' // every week will return a diferent leaderboard
});

// every time you need the current leaderboard, call
const lb = plb.getLeaderboardNow();
// now use lb as any other leaderboard

// get all existing periodic cycle keys (read docs)
plb.getExistingKeys(); // ["y2020-w2559", "y2020-w2560", ...]
```

### Leaderboard Matrix

Note: return objects are not shown here because they are too long for a TLDR. Please read [the documentation](/docs) for more details.

```javascript
const mlb = new LeaderboardMatrix(client, "mlb:sample", {
    dimensions: [
        { name: "global" },
        { name: "per-week", cycle: 'weekly' },
        { name: "per-month", cycle: 'monthly' }
    ],
    features: [{
        name: "kills",
        options: {
            updatePolicy: 'replace',
            sortPolicy: 'high-to-low'
        }
    }, {
        name: "seconds",
        options: {
            updatePolicy: 'best',
            sortPolicy: 'low-to-high'
        }
    }]
});

// get specific leaderboard
mlb.getLeaderboard("per-month", "kills");

// update multiple leaderboards at a time
mlb.update([{
    id: "player-1",
    values: {
        // update both features
        kills: 27,
        time: 427
    }
}], ["global", "per-week"]); // only update global and per-week dimensions (skip for all dimensions)

// remove
mlb.remove(["player-1", "player-2"]);

// find
mlb.find("player-1");

// queries
mlb.list("global", "kills", 1, 100);
// note: the sorting will ocurr on the leaderboard global/kills
// but the data retrieved will contain the data from all leaderboards
// and you can filter it!
// top, bottom & around are also supported for matrix leaderboards

// showcase
mlb.showcase(["per-week", "per-month", "global"], "kills", 10);
// top 10 entries from the first dimension listed that has at least 10 entries
// returns the last dimension if all have less than 10 entries
// very useful to show the most recent leaderboard and prevent empty results

// misc
mlb.count();
// return the count of every single leaderboard in the matrix
```

# Running tests

A Redis server in localhost without password is expected.

⚠️ Note: **The database #15 will be flushed** ⚠️

```shell
$ npm test
```

I tried with [ioredis-mock](https://www.npmjs.com/package/ioredis-mock) but I experienced some issues with Lua scripts so we have to rely on a real Redis server (which I think is better anyway).

# License

MIT. See [LICENSE](LICENSE).
