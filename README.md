
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
* **Clear interface**: based on promises and provides [TypeScript](https://www.typescriptlang.org) definitions
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
let lb = new Leaderboard(client, {
  redisKey: 'lb:test',
  sortPolicy: 'high-to-low',
  updatePolicy: 'replace'
});
```

Are you ready? [Jump to the examples]().

# Usage & API

## Leaderboard

Plain and simple leaderboard.

### Constructor

#### Arguments

* `client`: [Redis](https://github.com/luin/ioredis#connect-to-redis) connection object
* `options`: [LeaderboardOptions]() configuration
  * `redisKey`: [KeyType](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) Redis key for the sorted set (usually a string)
  * `sortPolicy`: [SortPolicy]() determines which scores are better than others  
    Allowed values:
    * `'high-to-low'`: sort scores in descending order
    * `'low-to-high'`: sort scores in ascending order
  * `updatePolicy`: [UpdatePolicy]() determines what happens between old and new scores  
    Allowed values:
    * `'replace'`: the new score will replace the previous one
    * `'aggregate'`: old and new scores will be added
    * `'best'`: the best score is kept (determined by the sort policy)
  * `limitTopN`?: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number): keep only the top N entries, determined by the sort policy.  
  This lets you limit the number of entries stored, thus saving memory.  
  If not specified, or the value is `0`, then there is no limit

#### Example

```javascript
let lb = new Leaderboard(client, {
  redisKey: 'lb:my-leaderboard',
  sortPolicy: 'high-to-low',
  updatePolicy: 'replace'
  // limitTopN: 1000 (commented, no limit)
});
```

### Insert/update/delete entries

Note that when you update an entry that doesn't exist, it will be created, so update/insert is the same operation.

* `updateOne(id: ID, value: Score | number)`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Score]() | void>
  * `id`: [ID]() id of the entry to update
  * `value`: [Score]() | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) score or number to add

  Example
  ```javascript
  lb.updateOne("player-1", 999);
  ```
  Complexity: `O(log(N))` where N is the number of entries in the leaderboard

  Note: why [Score]() | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)? When the update policy is set to `replace` or `best` the value should be a Score, but when the update policy is set to `aggregate` it behaves more like an amount than a full score. Either way, both are [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number).
* `update()`: Promise<Score[] | void[]>


### Information

* `count()`: [Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)> returns the number of entries stored in the leaderboard
* `redisClient`: [Redis](https://github.com/luin/ioredis#connect-to-redis) redis connection
* `redisKey`: [KeyType](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) sorted set key
* `sortPolicy`: [SortPolicy]() sort policy
* `updatePolicy`: [UpdatePolicy]() update policy

# Running tests

A Redis server with default configuration is expected in localhost.

⚠️ Note: **The database #15 will be flushed** ⚠️

```shell
$ npm test
```

I tried with [ioredis-mock](https://www.npmjs.com/package/ioredis-mock) but I experienced some issues with Lua scripts so we have to rely on a real Redis server (which I think is better anyway).

# License

MIT. See [LICENSE](LICENSE).
