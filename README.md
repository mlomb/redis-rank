
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
* **Performance**: guaranteed _at most_ one trip to Redis on each function call, taking advantage of [ioredis's pipelining](https://github.com/luin/ioredis#pipelining) and [Lua scripts](https://redis.io/commands/eval)
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

Continue reading for a TL;DR, or [jump to the full documentation](API.md).

# TL;DR

Ranks are 1-based. Almost every function returns a [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise).  
The detailed API documentation can be found in [API.md](API.md).

### Leaderboard

```javascript
// create
let lb = new Leaderboard(client, 'lb:my-leaderboard', {
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

// misc
lb.count(); /// === 3
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
