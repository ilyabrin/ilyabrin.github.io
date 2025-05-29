---
title: "PostgreSQL Index Types"
date: 2025-03-01T13:01:14+01:00

author: "Ilya Brin"
categories: ['postgresql']
tags: ['sql', 'pg', 'postgresql', 'databases']
---

Imagine searching for your favorite song on an old mp3 player without a playlist - scrolling through tracks one by one until you stumble upon the right one. That's PostgreSQL without indexes: huffing, puffing, and scanning every row in our huge table.

Now add indexes - and you've got Spotify with instant search!

Let's quickly break down what indexes PostgreSQL has, why you need them, and how they transform your database from a turtle into a rocket. Plus - a couple of real-life examples to feel the difference.

<!--more-->

## Why do we need these indexes?

Let's say we have a `users` table with a million people, and we want to find all the Smiths. Without an index, PostgreSQL runs a marathon: it goes through every row looking for the right surname. You're already finishing your second cup of tea, and the result is still somewhere on the horizon. With an index - bam! - and you have the data in milliseconds. Indexes speed up `SELECT`, `WHERE`, `JOIN`, and sometimes even `ORDER BY`. It's like teleportation for queries! But it's not that simple: you have to pay for speed, and I'll tell you exactly what.

## What index types does PostgreSQL have?

PostgreSQL is like a Swiss Army knife with tons of blades. Here are its index types:

**1. B-tree (balanced tree)**

The king of the party! Reliable, universal, like jeans - for all occasions. Excellent with `=`, `<`, `>` operators, ranges, and sorting. Write `CREATE INDEX` - get `B-tree` by default.
*Example*: In an online store, you're looking for orders from January (`WHERE order_date > '2025-01-01'`). B-tree on `order_date` - and you're done.

**2. Hash**

Fast as lightning, but only for exact matches (`=`). No ranges or sorting for you.
*Example*: Checking a promo code (`WHERE discount_code = 'FREEBEER'`). Hash index to the rescue!

**3. GIN (Generalized Inverted Index)**

Great for JSON searches and text search. It's like Google inside your database.
*Example*: Looking for blog posts with tags `['cats', 'programming']`. Create GIN on the tags column - and you're already browsing results.

**4. GiST (Generalized Search Tree)**

The king of geometry and complex tasks. Need restaurants within 5 km? No problem!
*Example*: Writing a delivery app with nearest pizzeria search. GiST knows how to do this fast.

**5. BRIN (Block Range Index)**

Light, fast, takes little space - ideal for huge tables with ordered data (like by time).
*Example*: Server logs for a year. BRIN on `log_time` - and queries like `WHERE log_time > '2025-03-01'` fly.

**6. Unique index**

Not a type, but more like a superhero cape for B-tree. Makes sure there are no clones in the column.
*Example*: `email` in `users` table. One address - one owner, no duplicates!

## Live examples: without indexes and with them

**Without index: like a turtle on a walk**
We have an `orders` table with 10 million orders. We want to find orders for user with `user_id = 42`. Query:

```sql
SELECT * FROM orders WHERE user_id = 42;
```

Without an index, PostgreSQL becomes a meticulous accountant: checks every order, whispering "42... no, 42... no". 5 seconds - and you're already thinking it might be easier to find them manually. The client yawns, the app slows down, and you blush in front of the customer.

**With index: like a rocket at launch**
We add:

```sql
CREATE INDEX idx_orders_user_id ON orders (user_id);
```

And - voilà! The same query now takes 0.01 seconds. PostgreSQL, like a superhero, dives straight to the needed rows. The user is delighted, you're delighted, and the database quietly purrs with happiness. Awesome!

**Another example: range hunting**
Query `SELECT * FROM orders WHERE order_date BETWEEN '2025-01-01' AND '2025-01-31'` without an index is like looking for a needle in a haystack blindfolded. With `B-tree` on `order_date` - cosmic speed!

## Why indexes are cool?

* **Speed**: Queries fly instead of crawl.
* **Ease**: Server doesn't strain, and you don't waste nerves.
* **User happiness**: Users don't leave due to long waits.

But it's not all rosy. Indexes aren't candy you can hand out to everyone.

## When indexes are overkill?

* **Mini-tables**
If you have 50 rows, PostgreSQL will handle it without an index faster than you can say "query optimization".

* **Non-stop writes**
Indexes update with every `INSERT` or `UPDATE`. If you're writing logs every second, the index will only slow down the party.

* **All the same**
A column like `status = 'active'` for 99% of records? An index here would be like an umbrella in the desert.

* **Too many indexes**
Indexes themselves also require disk space, and the more indexes the database has, the more space it will take. And memory too.

## Life hack: how not to miss with an index?

* Run `EXPLAIN` on your query. See `Seq Scan`? That's a signal - you need an index!
* For exact matches - Hash or B-tree.
* Ranges and sorting - B-tree.
* JSON or arrays - call GIN.
* Huge tables with order - BRIN will help.

**Final chord**
Indexes in PostgreSQL are like nitro for databases: add them at the right moment, and the database takes off. They turn boring search into an exciting dance where every step is precise and fast. But without fanaticism: indexes are seasoning, not the main dish. Use them wisely, and your database will sing with joy, and users will give a standing ovation.
