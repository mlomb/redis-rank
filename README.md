
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

You are ready, now read one of the examples linked below!

# Examples

* [Basic leaderboard usage](docs/EXAMPLES.md#basic-leaderboard-usage)
* [Exporting a leaderboard](docs/EXAMPLES.md#exporting-a-leaderboard)
* [Recurring leaderboards](docs/EXAMPLES.md#recurring-leaderboards)
* [Custom cycles](docs/EXAMPLES.md#custom-cycles)
* [Clean stale leaderboards](docs/EXAMPLES.md#clean-stale-leaderboards)
* [Matrix of leaderboards](docs/EXAMPLES.md#matrix-of-leaderboards)
* [Showcasing leaderboards](docs/EXAMPLES.md#showcasing-leaderboards)

# API

* [Types](docs/#types)
* [Leaderboard](docs/Leaderboard.md)
  * [Types](docs/Leaderboard.md#types)
  * [Constructor](docs/Leaderboard.md#constructor)
  * [Insert/update entries](docs/Leaderboard.md#insertupdate-entries)
  * [Remove entries](docs/Leaderboard.md#remove-entries)
  * [Find entries](docs/Leaderboard.md#find-entries)
  * [List entries](docs/Leaderboard.md#list-entries)
  * [Export](docs/Leaderboard.md#export)
  * [Information](docs/Leaderboard.md#information)
* [PeriodicLeaderboard](docs/PeriodicLeaderboard.md)
  * [Types](docs/PeriodicLeaderboard.md#types)
  * [Constructor](docs/PeriodicLeaderboard.md#constructor)
  * [Keys](docs/PeriodicLeaderboard.md#keys)
  * [Leaderboards](docs/PeriodicLeaderboard.md#leaderboards)
* [LeaderboardMatrix](docs/LeaderboardMatrix.md)
  * [Types](docs/LeaderboardMatrix.md#types)
  * [Constructor](docs/LeaderboardMatrix.md#constructor)
  * [Leaderboards](docs/LeaderboardMatrix.md#leaderboards)
  * [Insert/update entries](docs/LeaderboardMatrix.md#insertupdate-entries)
  * [Remove entries](docs/LeaderboardMatrix.md#remove-entries)
  * [Find entries](docs/LeaderboardMatrix.md#find-entries)
  * [List entries](docs/LeaderboardMatrix.md#list-entries)
  * [Information](docs/LeaderboardMatrix.md#information)
* [Redis keys](docs/#redis-keys)

# Running tests

A Redis server in localhost without password is expected.

⚠️ Note: **The database #15 will be flushed** ⚠️

```shell
$ npm test
```

I tried with [ioredis-mock](https://www.npmjs.com/package/ioredis-mock) but I experienced some issues with Lua scripts so we have to rely on a real Redis server (which I think is better anyway).

# License

MIT. See [LICENSE](LICENSE).
