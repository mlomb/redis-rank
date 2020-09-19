
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

<h1 align="center">2.0 WORK IN PROGRESS</h1>

*write something here*

# Features
* **Lightweight**: minimal dependencies, only [ioredis](https://github.com/luin/ioredis) is required
* **Performance**: guaranteed _at most_ one trip to Redis on each function call, taking advantage of [ioredis's pipelining](https://github.com/luin/ioredis#pipelining) and [Lua scripts](https://redis.io/commands/eval)
* **Drop-in replacement**: use any existing sorted set
* **Clear interface**: based on [promises](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise) and provides [TypeScript](https://www.typescriptlang.org) definitions
* **Periodic leaderboards**: create recurring leaderboards (_daily_, _weekly_, _monthly_, _etc_)
* **Combine leaderboards**: create a matrix of leaderboards, query one and retrieve multiple, all in a single call
* **Export**: export your leaderboards for long-term storage
* **Tested**: 100% code coverage

# Quick Start

## Install

```shell
$ npm install redis-rank ioredis
```

Redis 2.6.12 or newer is required. The package [ioredis](https://www.npmjs.com/package/ioredis) is a peer dependency and must be installed separately.

## Import and connect

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

Now create a basic leaderboard.
You will have to provide a [ioredis](https://github.com/luin/ioredis) connection object.
See [here](https://github.com/luin/ioredis#connect-to-redis) for more information.

```javascript
// setup connection
let client = new Redis(); // see ioredis

// create a leaderboard
let lb = new Leaderboard(client, 'lb:test', {
  sortPolicy: 'high-to-low',
  updatePolicy: 'replace'
});
```

Continue reading for a TL;DR, or [jump to the full documentation](API.md).

# TL;DR

Ranks are 1-based.  
The detailed API documentation can be found in [API.md](API.md).

### Leaderboard

```javascript
// create
let lb = new Leaderboard(client, 'lb:my-leaderboard', {
  sortPolicy: 'high-to-low', // or 'low-to-high'
  updatePolicy: 'replace' // or 'aggregate' or 'best'
  // limitTopN: 1000 // only keep top N entries
});

// insert/update (if it doesn't exist, it will be created)
await lb.updateOne("player-1", 123);
await lb.update({ id: "player-1", value: 123 });
await lb.update([
    { id: "player-1", value: 123 },
    { id: "player-2", value: 420 },
    { id: "player-3", value: 696 }
]);

// remove
await lb.remove("player-1");
await lb.remove(["player-1", "player-2", "player-3"]);
await lb.clear(); // remove all

// find (null if not found)
await lb.score("player-1"); /// === 123
await lb.rank("player-1"); /// === 3
await lb.find("player-1"); /// === { id: "player-1", score: 123, rank: 3 }
await lb.at(3); /// === { id: "player-1", score: 123, rank: 3 }

// query
await lb.top(10); /// === [{ id: "n1", score: 999, rank: 1 }, ... 9 more]
await lb.bottom(10); /// === [{ id: "n10", score: 111, rank: 10 }, ... 9 more]
await lb.list(100, 200); /// === [{ id: "n100", score: 100, rank: 100 }, ... 100 more]
await lb.around("player-1", 4); /// === [... 4 more, { id: "player-1", score: 100, rank: 5 }, ... 4 more]

// misc
await lb.count(); /// === 3
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
