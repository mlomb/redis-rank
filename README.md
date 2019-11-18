# redis-rank

[![Build Status](https://travis-ci.org/mlomb/redis-rank.svg?branch=master)](https://travis-ci.org/mlomb/redis-rank)
[![codecov](https://codecov.io/gh/mlomb/redis-rank/branch/master/graph/badge.svg)](https://codecov.io/gh/mlomb/redis-rank)
[![npm](https://img.shields.io/npm/v/redis-rank)](https://www.npmjs.com/package/redis-rank)

Back-end to generate and manage leaderboards using [Redis](https://redis.io/). Written in [TypeScript](https://www.typescriptlang.org/) and [Promise-based](https://developer.mozilla.org/es/docs/Web/JavaScript/Referencia/Objetos_globales/Promise).

# Features

All the library is promise based.

* Plain Leaderboards. Insert and update entries. List them in multiple ways.
* *PLANNED*: Periodic Leaderboards (daily, weekly, monthly, all-time)
* *PLANNED*: Matrix Leaderboards (multiple dimensions)
* *PLANNED*: Archive (export) leaderboards to another database for long-term storage

# Quick Start

## Install

```shell
$ npm install redis-rank
```

Redis 2.6.12 or newer is required.
[ioredis](https://github.com/luin/ioredis) package is a dependency.

## Import and connect

You must provide the [ioredis](https://github.com/luin/ioredis) connection object.  
See [here](https://github.com/luin/ioredis#connect-to-redis) for more information on how to set it up.

ES5
```javascript
const Redis = require('ioredis');
const RedisRank = require('redis-rank');

// setup connection
let ioredis_client = new Redis({
  host: "127.0.0.1",
  port: 6379
});
// create a leaderboard
let lb = new RedisRank.Leaderboard(ioredis_client);
```
ES6
```javascript
import { Redis } from 'ioredis';
import { Leaderboard } from 'redis-rank';

// setup connection
let ioredis_client = new Redis({
  host: "127.0.0.1",
  port: 6379
});
// create a leaderboard
let lb = new Leaderboard(ioredis_client);
```

## Basic usage

All the methods listed here are promises.

```javascript
// add entries
lb.add("alice", 25);
lb.add("bob", 13);
lb.add("dave", 42);
lb.add("eve", 54);

// update entries
lb.add("bob", 27); // replace score
lb.incr("alice", 10); // increment by 10, now 35
lb.incr("dave", -5); // decrement by 5, now 37

// remove entries
lb.remove("eve"); // eve is no more

// count entries
lb.total(); // number of entries stored: 3

// query entries
lb.peek("bob"); // { id: "bob", score: 27, rank: 2 }
lb.score("dave"); // dave's score: 37
lb.rank("alice"); // alice's rank: 3
lb.at(1); // get entry at a specific rank: { id: "dave", ... }

// list entries
// all of these return an array of entries
// something like [{ id: "...", score: xxx, rank: xx }, ...]
lb.list(5, 10); // entries between ranks 5 and 10 inclusive
lb.top(10); // the top 10 entries. Alias for list(1, max)
lb.around("id", 10); // get 10 entries above and below the queried entry

// remove all entries
lb.clear();
```

Note: most of the methods will return `null` if the entry is not found.

### Leaderboard Options

Available options for Leaderboard, along with their defaults.

```javascript
new Leaderboard(redis, {
    // redis key to store the sorted set
    path: "lb",
    // inverse leaderboard: true if lower scores are better
    lowToHigh: false
});
```

## API
You can [peek at the documented code](src/Leaderboard.ts) for more information.  
TypeScript definitions are available.

## Running tests

No Redis server is required. [ioredis-mock](https://www.npmjs.com/package/ioredis-mock) is used to mock Redis.

```shell
$ npm test
```

# License

MIT. See [LICENSE](LICENSE).
